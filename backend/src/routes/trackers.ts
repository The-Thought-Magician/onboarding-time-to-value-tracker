import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  trackers,
  tracker_milestones,
  template_milestones,
  journey_templates,
  accounts,
  activities,
  workspaces,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function daysBetween(from: Date | null | undefined, to: Date | null | undefined): number {
  if (!from || !to) return 0
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY)
}

// Recompute progress, projection, TTV markers and risk score from milestone state.
async function recomputeTracker(trackerId: string) {
  const [t] = await db.select().from(trackers).where(eq(trackers.id, trackerId))
  if (!t) return null
  const ms = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, trackerId))
    .orderBy(tracker_milestones.position)

  const totalWeight = ms.reduce((acc, m) => acc + (m.weight ?? 1), 0) || 1
  const completedWeight = ms
    .filter((m) => m.status === 'completed')
    .reduce((acc, m) => acc + (m.weight ?? 1), 0)
  const progressPct = Math.round((completedWeight / totalWeight) * 1000) / 10

  // First-value timestamp: completed_at of the first completed is_first_value milestone.
  const firstValueMs = ms.find((m) => m.is_first_value && m.status === 'completed')
  const goLiveMs = ms.find((m) => m.is_go_live && m.status === 'completed')

  const startedAt = t.started_at ?? t.created_at
  const totalTargetDays = ms.reduce((acc, m) => acc + (m.target_days ?? 0), 0)

  // Projected go-live: from started_at + total target days, but slip if behind.
  const remaining = ms.filter((m) => m.status !== 'completed')
  const remainingTargetDays = remaining.reduce((acc, m) => acc + (m.target_days ?? 0), 0)
  const elapsedDays = daysBetween(startedAt, new Date())
  // pace = elapsed per completed weight (slippage factor)
  const completedCount = ms.filter((m) => m.status === 'completed').length
  const completedTargetDays = ms
    .filter((m) => m.status === 'completed')
    .reduce((acc, m) => acc + (m.target_days ?? 0), 0)
  let slipFactor = 1
  if (completedTargetDays > 0 && completedCount > 0) {
    slipFactor = Math.max(0.5, elapsedDays / completedTargetDays)
  }
  const projectedDays = remainingTargetDays * slipFactor
  const projectedGoLive = goLiveMs?.completed_at
    ? null
    : startedAt
      ? new Date(startedAt.getTime() + (elapsedDays + projectedDays) * MS_PER_DAY)
      : null

  // Risk score 0..100: overdue vs target + open-milestone staleness.
  let risk = 0
  if (totalTargetDays > 0 && elapsedDays > totalTargetDays && t.status !== 'live') {
    risk += Math.min(60, ((elapsedDays - totalTargetDays) / totalTargetDays) * 100)
  }
  const blockedCount = ms.filter((m) => m.status === 'blocked').length
  risk += blockedCount * 15
  risk = Math.min(100, Math.round(risk * 10) / 10)

  const newStatus =
    goLiveMs?.completed_at != null
      ? 'live'
      : t.status === 'live'
        ? 'live'
        : t.status === 'paused'
          ? 'paused'
          : 'in_progress'

  const [updated] = await db
    .update(trackers)
    .set({
      progress_pct: progressPct,
      projected_go_live: projectedGoLive,
      risk_score: risk,
      first_value_at: firstValueMs?.completed_at ?? t.first_value_at ?? null,
      go_live_at: goLiveMs?.completed_at ?? t.go_live_at ?? null,
      status: newStatus,
      last_activity_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(trackers.id, trackerId))
    .returning()
  return updated
}

async function logActivity(args: {
  workspace_id: string
  user_id: string
  tracker_id: string
  account_id?: string | null
  type: string
  actor?: string
  message: string
  meta?: Record<string, unknown>
}) {
  await db.insert(activities).values({
    workspace_id: args.workspace_id,
    user_id: args.user_id,
    tracker_id: args.tracker_id,
    account_id: args.account_id ?? null,
    type: args.type,
    actor: args.actor ?? '',
    message: args.message,
    meta: args.meta ?? {},
  })
}

// ---------------------------------------------------------------------------
// GET / — public — list trackers (filter: status, manager, segment, q)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const status = c.req.query('status')
  const manager = c.req.query('manager')
  const segment = c.req.query('segment')
  const q = c.req.query('q')

  const conds = []
  if (status) conds.push(eq(trackers.status, status))
  if (manager) conds.push(eq(trackers.manager_id, manager))

  let rows = await db
    .select({
      tracker: trackers,
      account: accounts,
    })
    .from(trackers)
    .leftJoin(accounts, eq(accounts.id, trackers.account_id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(trackers.updated_at))

  if (segment) rows = rows.filter((r) => r.account?.segment_id === segment)
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => (r.account?.name ?? '').toLowerCase().includes(needle))
  }

  const out = rows.map((r) => ({
    ...r.tracker,
    account_name: r.account?.name ?? null,
    account_segment_id: r.account?.segment_id ?? null,
    account_arr_cents: r.account?.arr_cents ?? 0,
  }))
  return c.json(out)
})

// ---------------------------------------------------------------------------
// GET /:id — public — tracker + milestones + account + recent activity
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, id))
  if (!tracker) return c.json({ error: 'Not found' }, 404)

  const milestones = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, id))
    .orderBy(tracker_milestones.position)

  const [account] = await db.select().from(accounts).where(eq(accounts.id, tracker.account_id))

  const activity = await db
    .select()
    .from(activities)
    .where(eq(activities.tracker_id, id))
    .orderBy(desc(activities.created_at))
    .limit(50)

  return c.json({ tracker, milestones, account: account ?? null, activity })
})

// ---------------------------------------------------------------------------
// POST / — auth — create tracker from account+template (snapshots milestones)
// ---------------------------------------------------------------------------
const createSchema = z.object({
  account_id: z.string().min(1),
  template_id: z.string().min(1),
  manager_id: z.string().optional().nullable(),
  started_at: z.string().datetime().optional(),
})

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')

  const [account] = await db.select().from(accounts).where(eq(accounts.id, body.account_id))
  if (!account) return c.json({ error: 'Account not found' }, 404)
  if (account.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [template] = await db
    .select()
    .from(journey_templates)
    .where(eq(journey_templates.id, body.template_id))
  if (!template) return c.json({ error: 'Template not found' }, 404)

  // One tracker per account (account_id is UNIQUE).
  const [existing] = await db.select().from(trackers).where(eq(trackers.account_id, body.account_id))
  if (existing) return c.json({ error: 'A tracker already exists for this account' }, 409)

  const startedAt = body.started_at ? new Date(body.started_at) : new Date()

  const [tracker] = await db
    .insert(trackers)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      account_id: body.account_id,
      template_id: body.template_id,
      template_version: template.version ?? 1,
      manager_id: body.manager_id ?? account.cs_owner_id ?? null,
      status: 'in_progress',
      started_at: startedAt,
      last_activity_at: new Date(),
    })
    .returning()

  // Snapshot template milestones into tracker_milestones.
  const tmpl = await db
    .select()
    .from(template_milestones)
    .where(eq(template_milestones.template_id, body.template_id))
    .orderBy(template_milestones.position)

  const snapshots = tmpl.map((m) => ({
    tracker_id: tracker.id,
    template_milestone_id: m.id,
    name: m.name,
    category: m.category,
    position: m.position,
    target_days: m.target_days,
    weight: m.weight ?? 1,
    is_first_value: m.is_first_value,
    is_go_live: m.is_go_live,
    status: 'not_started',
  }))
  let firstMilestoneId: string | null = null
  if (snapshots.length) {
    const inserted = await db.insert(tracker_milestones).values(snapshots).returning()
    const sorted = inserted.sort((a, b) => a.position - b.position)
    firstMilestoneId = sorted[0]?.id ?? null
  }

  if (firstMilestoneId) {
    await db
      .update(trackers)
      .set({ current_milestone_id: firstMilestoneId })
      .where(eq(trackers.id, tracker.id))
  }

  await logActivity({
    workspace_id: ws.id,
    user_id: userId,
    tracker_id: tracker.id,
    account_id: account.id,
    type: 'tracker_created',
    message: `Started onboarding for ${account.name} using ${template.name}`,
    meta: { template_id: template.id, milestones: snapshots.length },
  })

  const updated = await recomputeTracker(tracker.id)
  return c.json(updated ?? tracker, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update tracker (status, manager, etc.)
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  status: z.enum(['in_progress', 'paused', 'live', 'churned', 'cancelled']).optional(),
  manager_id: z.string().optional().nullable(),
  template_version: z.number().int().optional(),
  target_go_live: z.string().datetime().optional().nullable(),
})

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(trackers).where(eq(trackers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.status !== undefined) patch.status = body.status
  if (body.manager_id !== undefined) patch.manager_id = body.manager_id
  if (body.template_version !== undefined) patch.template_version = body.template_version

  const [updated] = await db.update(trackers).set(patch).where(eq(trackers.id, id)).returning()

  await logActivity({
    workspace_id: existing.workspace_id,
    user_id: userId,
    tracker_id: id,
    account_id: existing.account_id,
    type: 'tracker_updated',
    message: 'Tracker updated',
    meta: { ...body },
  })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete (cascades milestones + activities)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(trackers).where(eq(trackers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(activities).where(eq(activities.tracker_id, id))
  await db.delete(tracker_milestones).where(eq(tracker_milestones.tracker_id, id))
  await db.delete(trackers).where(eq(trackers.id, id))
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// POST /:id/advance — auth — complete current milestone, advance to next,
// recompute TTV/projection/progress, log activity
// ---------------------------------------------------------------------------
router.post('/:id/advance', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, id))
  if (!tracker) return c.json({ error: 'Not found' }, 404)
  if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const ms = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, id))
    .orderBy(tracker_milestones.position)
  if (!ms.length) return c.json({ error: 'No milestones to advance' }, 400)

  // Current = the explicitly-tracked one, else first non-completed.
  let current = ms.find((m) => m.id === tracker.current_milestone_id)
  if (!current || current.status === 'completed') {
    current = ms.find((m) => m.status !== 'completed')
  }
  if (!current) return c.json({ error: 'All milestones already complete' }, 400)

  const now = new Date()
  await db
    .update(tracker_milestones)
    .set({ status: 'completed', completed_at: now, started_at: current.started_at ?? now })
    .where(eq(tracker_milestones.id, current.id))

  // Move to next milestone (by position) that isn't completed.
  const next = ms
    .filter((m) => m.position > current!.position && m.id !== current!.id)
    .sort((a, b) => a.position - b.position)
    .find((m) => m.status !== 'completed')

  if (next) {
    await db
      .update(tracker_milestones)
      .set({ status: next.status === 'not_started' ? 'in_progress' : next.status, started_at: next.started_at ?? now })
      .where(eq(tracker_milestones.id, next.id))
  }

  await db
    .update(trackers)
    .set({ current_milestone_id: next?.id ?? current.id })
    .where(eq(trackers.id, id))

  await logActivity({
    workspace_id: tracker.workspace_id,
    user_id: userId,
    tracker_id: id,
    account_id: tracker.account_id,
    type: 'milestone_completed',
    message: `Completed milestone "${current.name}"${next ? ` and advanced to "${next.name}"` : ''}`,
    meta: { completed_milestone_id: current.id, next_milestone_id: next?.id ?? null },
  })

  const updated = await recomputeTracker(id)
  const milestones = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, id))
    .orderBy(tracker_milestones.position)
  return c.json({ tracker: updated, milestones })
})

// ---------------------------------------------------------------------------
// POST /:id/regress — auth — move back a milestone, log activity
// ---------------------------------------------------------------------------
router.post('/:id/regress', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, id))
  if (!tracker) return c.json({ error: 'Not found' }, 404)
  if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const ms = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, id))
    .orderBy(tracker_milestones.position)
  if (!ms.length) return c.json({ error: 'No milestones' }, 400)

  // Find the latest completed milestone and revert it.
  const completed = ms.filter((m) => m.status === 'completed').sort((a, b) => b.position - a.position)
  const target = completed[0]
  if (!target) return c.json({ error: 'No completed milestone to regress' }, 400)

  await db
    .update(tracker_milestones)
    .set({ status: 'in_progress', completed_at: null })
    .where(eq(tracker_milestones.id, target.id))

  await db
    .update(trackers)
    .set({ current_milestone_id: target.id })
    .where(eq(trackers.id, id))

  await logActivity({
    workspace_id: tracker.workspace_id,
    user_id: userId,
    tracker_id: id,
    account_id: tracker.account_id,
    type: 'milestone_regressed',
    message: `Reopened milestone "${target.name}"`,
    meta: { milestone_id: target.id },
  })

  const updated = await recomputeTracker(id)
  const milestones = await db
    .select()
    .from(tracker_milestones)
    .where(eq(tracker_milestones.tracker_id, id))
    .orderBy(tracker_milestones.position)
  return c.json({ tracker: updated, milestones })
})

// ---------------------------------------------------------------------------
// PUT /:id/milestones/:mid — auth — set milestone status (start/block/complete)
// ---------------------------------------------------------------------------
const milestoneStatusSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'blocked', 'completed']),
})

router.put(
  '/:id/milestones/:mid',
  authMiddleware,
  zValidator('json', milestoneStatusSchema),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const mid = c.req.param('mid')
    const [tracker] = await db.select().from(trackers).where(eq(trackers.id, id))
    if (!tracker) return c.json({ error: 'Tracker not found' }, 404)
    if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    const [milestone] = await db
      .select()
      .from(tracker_milestones)
      .where(and(eq(tracker_milestones.id, mid), eq(tracker_milestones.tracker_id, id)))
    if (!milestone) return c.json({ error: 'Milestone not found' }, 404)

    const { status } = c.req.valid('json')
    const now = new Date()
    const patch: Record<string, unknown> = { status }
    if (status === 'in_progress' || status === 'blocked') {
      patch.started_at = milestone.started_at ?? now
      patch.completed_at = null
    }
    if (status === 'completed') {
      patch.started_at = milestone.started_at ?? now
      patch.completed_at = now
    }
    if (status === 'not_started') {
      patch.started_at = null
      patch.completed_at = null
    }

    const [updated] = await db
      .update(tracker_milestones)
      .set(patch)
      .where(eq(tracker_milestones.id, mid))
      .returning()

    await logActivity({
      workspace_id: tracker.workspace_id,
      user_id: userId,
      tracker_id: id,
      account_id: tracker.account_id,
      type: 'milestone_status',
      message: `Milestone "${milestone.name}" set to ${status}`,
      meta: { milestone_id: mid, status },
    })

    await recomputeTracker(id)
    return c.json(updated)
  },
)

export default router
