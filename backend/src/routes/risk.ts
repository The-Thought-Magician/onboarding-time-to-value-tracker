import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  risk_items,
  trackers,
  accounts,
  tracker_milestones,
  blockers,
  sla_policies,
  workspaces,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

function daysBetween(from: Date | null | undefined, to: Date): number {
  if (!from) return 0
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

function severityForScore(score: number): string {
  if (score >= 70) return 'critical'
  if (score >= 40) return 'at_risk'
  return 'watch'
}

// ---------------------------------------------------------------------------
// GET / — public — at-risk queue (filter: triage_status, severity)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const triageStatus = c.req.query('triage_status')
  const severity = c.req.query('severity')
  const workspaceId = c.req.query('workspace_id')

  const conds = []
  if (triageStatus) conds.push(eq(risk_items.triage_status, triageStatus))
  if (severity) conds.push(eq(risk_items.severity, severity))
  if (workspaceId) conds.push(eq(risk_items.workspace_id, workspaceId))

  const rows = conds.length
    ? await db.select().from(risk_items).where(and(...conds)).orderBy(desc(risk_items.score))
    : await db.select().from(risk_items).orderBy(desc(risk_items.score))

  // Enrich with account name + arr for the queue view.
  const accs = await db.select().from(accounts)
  const accById = new Map(accs.map((a) => [a.id, a]))

  const enriched = rows.map((r) => {
    const acc = r.account_id ? accById.get(r.account_id) : undefined
    return {
      ...r,
      account_name: acc?.name ?? null,
      arr_cents: acc?.arr_cents ?? 0,
      health: acc?.health ?? null,
    }
  })
  return c.json(enriched)
})

// ---------------------------------------------------------------------------
// POST /recompute — auth — recompute risk items across trackers
// Walks every active tracker for the caller's workspace, scores it on
// schedule slippage, open blockers, SLA breach risk and inactivity, then
// upserts a risk_item row. Resolved/healthy trackers get their open risk
// items cleared.
// ---------------------------------------------------------------------------
const recomputeSchema = z.object({ workspace_id: z.string().optional() }).optional()

router.post('/recompute', authMiddleware, zValidator('json', recomputeSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json') ?? {}

  // Resolve the workspace to operate over: explicit body, else the caller's.
  let workspaceId = body.workspace_id
  if (!workspaceId) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
    if (!ws) return c.json({ created: 0, updated: 0 })
    workspaceId = ws.id
  } else {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
    if (!ws) return c.json({ error: 'Workspace not found' }, 404)
    if (ws.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  }

  const now = new Date()

  const wsTrackers = await db
    .select()
    .from(trackers)
    .where(eq(trackers.workspace_id, workspaceId))

  const wsAccounts = await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
  const accById = new Map(wsAccounts.map((a) => [a.id, a]))

  const wsSlas = await db
    .select()
    .from(sla_policies)
    .where(and(eq(sla_policies.workspace_id, workspaceId), eq(sla_policies.active, true)))

  const existingRisk = await db
    .select()
    .from(risk_items)
    .where(eq(risk_items.workspace_id, workspaceId))
  const riskByTracker = new Map(existingRisk.map((r) => [r.tracker_id, r]))

  let created = 0
  let updated = 0

  for (const t of wsTrackers) {
    const acc = accById.get(t.account_id)

    // Closed/completed trackers carry no risk — clear any open risk item.
    if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'archived') {
      const ex = riskByTracker.get(t.id)
      if (ex) {
        await db.delete(risk_items).where(eq(risk_items.id, ex.id))
      }
      continue
    }

    const reasons: string[] = []
    let score = 0

    // 1. Milestone schedule slippage: sum overdue days on started-not-done milestones.
    const ms = await db
      .select()
      .from(tracker_milestones)
      .where(eq(tracker_milestones.tracker_id, t.id))

    let overdueDays = 0
    for (const m of ms) {
      if (m.status === 'completed') continue
      const ref = m.started_at ?? t.started_at
      if (!ref) continue
      const elapsed = daysBetween(ref, now)
      const over = elapsed - (m.target_days ?? 0)
      if (over > 0) overdueDays += over
    }
    if (overdueDays > 0) {
      score += Math.min(40, overdueDays * 3)
      reasons.push(`${overdueDays} day(s) overdue across milestones`)
    }

    // 2. Open blockers, weighted by severity.
    const openBlockers = await db
      .select()
      .from(blockers)
      .where(and(eq(blockers.tracker_id, t.id), eq(blockers.status, 'open')))
    if (openBlockers.length > 0) {
      let blockerScore = 0
      for (const b of openBlockers) {
        blockerScore += b.severity === 'high' ? 12 : b.severity === 'medium' ? 6 : 3
      }
      score += Math.min(30, blockerScore)
      reasons.push(`${openBlockers.length} open blocker(s)`)
    }

    // 3. Inactivity: no activity for a while.
    const inactiveDays = daysBetween(t.last_activity_at, now)
    if (inactiveDays >= 7) {
      score += Math.min(20, inactiveDays)
      reasons.push(`${inactiveDays} day(s) of inactivity`)
    }

    // 4. SLA breach risk on first-value / go-live targets.
    if (t.started_at) {
      const sla = wsSlas.find((s) => {
        const segMatch = !s.segment_id || (acc && s.segment_id === acc.segment_id)
        const tmplMatch = !s.template_id || s.template_id === t.template_id
        return segMatch && tmplMatch
      })
      if (sla) {
        const grace = sla.grace_days ?? 0
        const elapsed = daysBetween(t.started_at, now)
        if (!t.first_value_at && elapsed > sla.target_first_value_days + grace) {
          score += 15
          reasons.push('First-value SLA breached')
        }
        if (!t.go_live_at && elapsed > sla.target_go_live_days + grace) {
          score += 20
          reasons.push('Go-live SLA breached')
        }
      }
    }

    score = Math.min(100, Math.round(score))

    const ex = riskByTracker.get(t.id)

    // No meaningful risk: clear any non-resolved existing item.
    if (score < 20) {
      if (ex && ex.triage_status !== 'resolved') {
        await db.delete(risk_items).where(eq(risk_items.id, ex.id))
      }
      continue
    }

    const severity = severityForScore(score)
    const reason = reasons.join('; ')

    if (ex) {
      await db
        .update(risk_items)
        .set({ severity, score, reason, account_id: t.account_id, updated_at: now })
        .where(eq(risk_items.id, ex.id))
      updated++
    } else {
      await db.insert(risk_items).values({
        workspace_id: workspaceId,
        user_id: userId,
        tracker_id: t.id,
        account_id: t.account_id,
        severity,
        score,
        reason,
        triage_status: 'new',
      })
      created++
    }

    // Keep the tracker's denormalized risk_score in sync.
    await db.update(trackers).set({ risk_score: score, updated_at: now }).where(eq(trackers.id, t.id))
  }

  return c.json({ created, updated })
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update triage status / assignee
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  triage_status: z.enum(['new', 'triaging', 'in_progress', 'resolved', 'dismissed']).optional(),
  assignee_id: z.string().nullable().optional(),
  severity: z.enum(['watch', 'at_risk', 'critical']).optional(),
})

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(risk_items).where(eq(risk_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(risk_items)
    .set({ ...body, updated_at: new Date() })
    .where(eq(risk_items.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// POST /:id/snooze — auth — snooze risk item
// ---------------------------------------------------------------------------
const snoozeSchema = z.object({
  until: z.string().datetime().optional(),
  days: z.number().int().positive().optional(),
})

router.post('/:id/snooze', authMiddleware, zValidator('json', snoozeSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(risk_items).where(eq(risk_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  let until: Date
  if (body.until) {
    until = new Date(body.until)
  } else {
    const days = body.days ?? 3
    until = new Date(Date.now() + days * DAY_MS)
  }

  const [updated] = await db
    .update(risk_items)
    .set({ snoozed_until: until, triage_status: 'triaging', updated_at: new Date() })
    .where(eq(risk_items.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — dismiss
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(risk_items).where(eq(risk_items.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(risk_items).where(eq(risk_items.id, id))
  return c.json({ success: true })
})

export default router
