import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  shared_plans,
  trackers,
  tracker_milestones,
  accounts,
  workspaces,
} from '../db/schema.js'
import { eq, and, asc, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function getWorkspaceFor(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return existing ?? null
}

function makeToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  )
}

// Build the public, read-only snapshot for a tracker: account header, ordered
// milestones with status/dates, and headline progress + key dates.
async function buildSnapshot(trackerId: string) {
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, trackerId))
  if (!tracker) return null
  const [account] = await db.select().from(accounts).where(eq(accounts.id, tracker.account_id))
  const milestones = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, trackerId))
    .orderBy(asc(tracker_milestones.position))

  const total = milestones.length
  const done = milestones.filter((m) => m.status === 'completed').length

  return {
    account: account
      ? {
          name: account.name,
          domain: account.domain,
          plan: account.plan,
          health: account.health,
          target_go_live: account.target_go_live?.toISOString() ?? null,
        }
      : null,
    progress: {
      pct: tracker.progress_pct ?? (total ? Math.round((done / total) * 100) : 0),
      completed: done,
      total,
      status: tracker.status,
    },
    dates: {
      started_at: tracker.started_at?.toISOString() ?? null,
      first_value_at: tracker.first_value_at?.toISOString() ?? null,
      go_live_at: tracker.go_live_at?.toISOString() ?? null,
      projected_go_live: tracker.projected_go_live?.toISOString() ?? null,
    },
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      position: m.position,
      status: m.status,
      is_first_value: m.is_first_value,
      is_go_live: m.is_go_live,
      started_at: m.started_at?.toISOString() ?? null,
      completed_at: m.completed_at?.toISOString() ?? null,
    })),
  }
}

const createSchema = z.object({
  tracker_id: z.string().min(1),
  title: z.string().optional().default(''),
})

const updateSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().optional(),
  refresh: z.boolean().optional(),
})

// GET / — public — list caller-relevant shared plans (by workspace)
router.get('/', async (c) => {
  const userId = c.req.query('user') ?? c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (!userId) return c.json([])
  const ws = await getWorkspaceFor(userId)
  if (!ws) return c.json([])
  const rows = await db
    .select()
    .from(shared_plans)
    .where(eq(shared_plans.workspace_id, ws.id))
    .orderBy(desc(shared_plans.created_at))
  return c.json(rows)
})

// GET /public/:token — public — fetch a shared plan by token (no auth)
router.get('/public/:token', async (c) => {
  const token = c.req.param('token')
  const [plan] = await db.select().from(shared_plans).where(eq(shared_plans.token, token))
  if (!plan || !plan.active) return c.json({ error: 'Not found' }, 404)
  const snapshot = plan.snapshot as Record<string, unknown>
  return c.json({
    plan: { title: plan.title, created_at: plan.created_at },
    milestones: (snapshot?.milestones as unknown[]) ?? [],
    account: (snapshot?.account as Record<string, unknown>) ?? null,
    progress: (snapshot?.progress as Record<string, unknown>) ?? null,
    dates: (snapshot?.dates as Record<string, unknown>) ?? null,
  })
})

// POST / — auth — create shareable plan from a tracker (token + snapshot)
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, body.tracker_id))
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404)
  if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const snapshot = await buildSnapshot(tracker.id)
  if (!snapshot) return c.json({ error: 'Tracker not found' }, 404)

  const [created] = await db
    .insert(shared_plans)
    .values({
      workspace_id: tracker.workspace_id,
      user_id: userId,
      tracker_id: tracker.id,
      token: makeToken(),
      title: body.title || (snapshot.account?.name ? `${snapshot.account.name} Onboarding Plan` : 'Onboarding Plan'),
      active: true,
      snapshot,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — auth — toggle active / refresh snapshot / retitle
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(shared_plans).where(eq(shared_plans.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  const patch: Record<string, unknown> = {}
  if (typeof body.active === 'boolean') patch.active = body.active
  if (typeof body.title === 'string') patch.title = body.title
  if (body.refresh) {
    const snapshot = await buildSnapshot(existing.tracker_id)
    if (snapshot) patch.snapshot = snapshot
  }
  if (Object.keys(patch).length === 0) return c.json(existing)

  const [updated] = await db
    .update(shared_plans)
    .set(patch)
    .where(eq(shared_plans.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — auth — revoke
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(shared_plans).where(eq(shared_plans.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(shared_plans).where(eq(shared_plans.id, id))
  return c.json({ success: true })
})

export default router
