import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  blockers,
  blocker_categories,
  trackers,
  tracker_milestones,
  activities,
  workspaces,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const MS_PER_DAY = 86_400_000

async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

async function logActivity(args: {
  workspace_id: string
  user_id: string
  tracker_id: string
  account_id?: string | null
  type: string
  message: string
  meta?: Record<string, unknown>
}) {
  await db.insert(activities).values({
    workspace_id: args.workspace_id,
    user_id: args.user_id,
    tracker_id: args.tracker_id,
    account_id: args.account_id ?? null,
    type: args.type,
    message: args.message,
    meta: args.meta ?? {},
  })
}

// ---------------------------------------------------------------------------
// GET /categories — public — list blocker categories
// (declared before /:id-style routes; this file has no /:id GET so order is safe,
//  but keep specific paths above to be defensive)
// ---------------------------------------------------------------------------
router.get('/categories', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(blocker_categories)
        .where(eq(blocker_categories.workspace_id, workspaceId))
        .orderBy(blocker_categories.created_at)
    : await db.select().from(blocker_categories).orderBy(blocker_categories.created_at)
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /categories — auth — create category
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
})

router.post('/categories', authMiddleware, zValidator('json', categorySchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(blocker_categories)
    .values({ workspace_id: ws.id, user_id: userId, name: body.name, description: body.description })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// GET /friction — public — systemic friction aggregation by category + stage
// ---------------------------------------------------------------------------
router.get('/friction', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db.select().from(blockers).where(eq(blockers.workspace_id, workspaceId))
    : await db.select().from(blockers)

  // Resolve milestone categories (stage) for the involved milestones.
  const milestoneIds = [...new Set(rows.map((b) => b.tracker_milestone_id).filter(Boolean))] as string[]
  const milestoneStage = new Map<string, string>()
  for (const mid of milestoneIds) {
    const [m] = await db.select().from(tracker_milestones).where(eq(tracker_milestones.id, mid))
    if (m) milestoneStage.set(mid, m.category)
  }

  type Agg = {
    key: string
    count: number
    open: number
    resolved: number
    totalResolveDays: number
    resolvedWithTime: number
  }
  const byCategoryMap = new Map<string, Agg>()
  const byStageMap = new Map<string, Agg>()

  const bump = (map: Map<string, Agg>, key: string, b: typeof rows[number]) => {
    let a = map.get(key)
    if (!a) {
      a = { key, count: 0, open: 0, resolved: 0, totalResolveDays: 0, resolvedWithTime: 0 }
      map.set(key, a)
    }
    a.count += 1
    if (b.status === 'resolved') {
      a.resolved += 1
      if (b.resolved_at && b.opened_at) {
        a.totalResolveDays += (b.resolved_at.getTime() - b.opened_at.getTime()) / MS_PER_DAY
        a.resolvedWithTime += 1
      }
    } else {
      a.open += 1
    }
  }

  for (const b of rows) {
    bump(byCategoryMap, b.category ?? 'uncategorized', b)
    const stage = b.tracker_milestone_id ? milestoneStage.get(b.tracker_milestone_id) ?? 'unknown' : 'unassigned'
    bump(byStageMap, stage, b)
  }

  const finalize = (map: Map<string, Agg>) =>
    [...map.values()]
      .map((a) => ({
        key: a.key,
        count: a.count,
        open: a.open,
        resolved: a.resolved,
        avgResolveDays:
          a.resolvedWithTime > 0
            ? Math.round((a.totalResolveDays / a.resolvedWithTime) * 10) / 10
            : null,
      }))
      .sort((x, y) => y.count - x.count)

  return c.json({ byCategory: finalize(byCategoryMap), byStage: finalize(byStageMap) })
})

// ---------------------------------------------------------------------------
// GET / — public — list blockers (filter: tracker, status, category)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const tracker = c.req.query('tracker')
  const status = c.req.query('status')
  const category = c.req.query('category')

  const conds = []
  if (tracker) conds.push(eq(blockers.tracker_id, tracker))
  if (status) conds.push(eq(blockers.status, status))
  if (category) conds.push(eq(blockers.category, category))

  const rows = await db
    .select()
    .from(blockers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(blockers.opened_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — open blocker
// ---------------------------------------------------------------------------
const blockerSchema = z.object({
  tracker_id: z.string().min(1),
  tracker_milestone_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  category: z.string().optional().default('customer_side'),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  owner: z.string().optional().default(''),
})

router.post('/', authMiddleware, zValidator('json', blockerSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, body.tracker_id))
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404)
  if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(blockers)
    .values({
      workspace_id: tracker.workspace_id,
      user_id: userId,
      tracker_id: body.tracker_id,
      tracker_milestone_id: body.tracker_milestone_id ?? null,
      category_id: body.category_id ?? null,
      category: body.category,
      title: body.title,
      description: body.description,
      severity: body.severity,
      owner: body.owner,
      status: 'open',
    })
    .returning()

  await logActivity({
    workspace_id: tracker.workspace_id,
    user_id: userId,
    tracker_id: body.tracker_id,
    account_id: tracker.account_id,
    type: 'blocker_opened',
    message: `Blocker opened: ${body.title}`,
    meta: { blocker_id: created.id, severity: body.severity, category: body.category },
  })
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update blocker
// ---------------------------------------------------------------------------
const updateBlockerSchema = z.object({
  tracker_milestone_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  category: z.string().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  owner: z.string().optional(),
  status: z.enum(['open', 'resolved']).optional(),
})

router.put('/:id', authMiddleware, zValidator('json', updateBlockerSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(blockers).where(eq(blockers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { ...body }
  // Keep resolved_at consistent if status flips through PUT.
  if (body.status === 'resolved' && existing.status !== 'resolved') patch.resolved_at = new Date()
  if (body.status === 'open' && existing.status === 'resolved') patch.resolved_at = null

  const [updated] = await db.update(blockers).set(patch).where(eq(blockers.id, id)).returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /:id/resolve — auth — resolve blocker (set resolved_at)
// ---------------------------------------------------------------------------
router.post('/:id/resolve', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(blockers).where(eq(blockers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(blockers)
    .set({ status: 'resolved', resolved_at: new Date() })
    .where(eq(blockers.id, id))
    .returning()

  await logActivity({
    workspace_id: existing.workspace_id,
    user_id: userId,
    tracker_id: existing.tracker_id,
    type: 'blocker_resolved',
    message: `Blocker resolved: ${existing.title}`,
    meta: { blocker_id: id },
  })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /:id/reopen — auth — reopen
// ---------------------------------------------------------------------------
router.post('/:id/reopen', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(blockers).where(eq(blockers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(blockers)
    .set({ status: 'open', resolved_at: null })
    .where(eq(blockers.id, id))
    .returning()

  await logActivity({
    workspace_id: existing.workspace_id,
    user_id: userId,
    tracker_id: existing.tracker_id,
    type: 'blocker_reopened',
    message: `Blocker reopened: ${existing.title}`,
    meta: { blocker_id: id },
  })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(blockers).where(eq(blockers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(blockers).where(eq(blockers.id, id))
  return c.json({ success: true })
})

export default router
