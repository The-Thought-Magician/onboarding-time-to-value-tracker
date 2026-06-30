import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  trackers,
  accounts,
  tracker_milestones,
  team_members,
  workspaces,
} from '../db/schema.js'

const router = new Hono()

const DAY_MS = 86_400_000

function daysBetween(from: Date | null | undefined, to: Date): number {
  if (!from) return 0
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

const ACTIVE_STATUSES = new Set(['in_progress', 'active', 'at_risk', 'stalled', 'on_hold'])

// Compute days-overdue for a single tracker against its current/started
// milestones plus inactivity. Returns the worst (largest) overdue figure.
function computeOverdue(
  tracker: typeof trackers.$inferSelect,
  milestones: (typeof tracker_milestones.$inferSelect)[],
  now: Date,
  stallThresholdDays: number,
): { daysOverdue: number; inactiveDays: number; reason: string } {
  let milestoneOverdue = 0
  let worstMilestone = ''
  for (const m of milestones) {
    if (m.status === 'completed') continue
    const ref = m.started_at ?? tracker.started_at
    if (!ref) continue
    const elapsed = daysBetween(ref, now)
    const over = elapsed - (m.target_days ?? 0)
    if (over > milestoneOverdue) {
      milestoneOverdue = over
      worstMilestone = m.name
    }
  }
  const inactiveDays = daysBetween(tracker.last_activity_at, now)

  const reasons: string[] = []
  if (milestoneOverdue > 0) reasons.push(`${milestoneOverdue}d overdue on "${worstMilestone}"`)
  if (inactiveDays >= stallThresholdDays) reasons.push(`${inactiveDays}d since last activity`)

  // Days-overdue ranking metric: the larger of milestone slip and inactivity.
  const daysOverdue = Math.max(milestoneOverdue, inactiveDays >= stallThresholdDays ? inactiveDays : 0)
  return { daysOverdue, inactiveDays, reason: reasons.join('; ') }
}

function severityBand(daysOverdue: number): 'watch' | 'at_risk' | 'critical' {
  if (daysOverdue >= 14) return 'critical'
  if (daysOverdue >= 7) return 'at_risk'
  return 'watch'
}

interface StalledRow {
  tracker_id: string
  account_id: string
  account_name: string
  segment_id: string | null
  manager_id: string | null
  manager_name: string | null
  arr_cents: number
  days_overdue: number
  inactive_days: number
  arr_weighted_overdue: number
  severity: 'watch' | 'at_risk' | 'critical'
  reason: string
  status: string
}

async function buildStalledRows(workspaceId: string): Promise<StalledRow[]> {
  const now = new Date()

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  const stallThreshold = ws?.default_stall_days ?? 7

  const wsTrackers = await db
    .select()
    .from(trackers)
    .where(eq(trackers.workspace_id, workspaceId))

  const wsAccounts = await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
  const accById = new Map(wsAccounts.map((a) => [a.id, a]))

  const wsMembers = await db
    .select()
    .from(team_members)
    .where(eq(team_members.workspace_id, workspaceId))
  const memberById = new Map(wsMembers.map((m) => [m.id, m]))

  const allMs = await db.select().from(tracker_milestones)
  const msByTracker = new Map<string, (typeof tracker_milestones.$inferSelect)[]>()
  for (const m of allMs) {
    const list = msByTracker.get(m.tracker_id)
    if (list) list.push(m)
    else msByTracker.set(m.tracker_id, [m])
  }

  const rows: StalledRow[] = []
  for (const t of wsTrackers) {
    if (!ACTIVE_STATUSES.has(t.status)) continue
    const acc = accById.get(t.account_id)
    const ms = msByTracker.get(t.id) ?? []
    const { daysOverdue, inactiveDays, reason } = computeOverdue(t, ms, now, stallThreshold)
    if (daysOverdue <= 0) continue
    const arr = acc?.arr_cents ?? 0
    rows.push({
      tracker_id: t.id,
      account_id: t.account_id,
      account_name: acc?.name ?? 'Unknown',
      segment_id: acc?.segment_id ?? null,
      manager_id: t.manager_id ?? null,
      manager_name: t.manager_id ? memberById.get(t.manager_id)?.name ?? null : null,
      arr_cents: arr,
      days_overdue: daysOverdue,
      inactive_days: inactiveDays,
      arr_weighted_overdue: arr * daysOverdue,
      severity: severityBand(daysOverdue),
      reason,
      status: t.status,
    })
  }

  // Rank by ARR-weighted days overdue, descending.
  rows.sort((a, b) => b.arr_weighted_overdue - a.arr_weighted_overdue)
  return rows
}

async function resolveWorkspaceId(c: any): Promise<string | null> {
  const explicit = c.req.query('workspace_id')
  if (explicit) return explicit
  // Fall back to the X-User-Id header's workspace if available (public read,
  // but the proxy still forwards the header).
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (userId) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
    if (ws) return ws.id
  }
  // Last resort: any single workspace (single-tenant dev case).
  const [anyWs] = await db.select().from(workspaces)
  return anyWs?.id ?? null
}

// ---------------------------------------------------------------------------
// GET / — public — ranked stalled accounts by ARR-weighted days overdue
// (filter: segment, manager, severity)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = await resolveWorkspaceId(c)
  if (!workspaceId) return c.json([])

  const segment = c.req.query('segment')
  const manager = c.req.query('manager')
  const severity = c.req.query('severity')

  let rows = await buildStalledRows(workspaceId)
  if (segment) rows = rows.filter((r) => r.segment_id === segment)
  if (manager) rows = rows.filter((r) => r.manager_id === manager)
  if (severity) rows = rows.filter((r) => r.severity === severity)

  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /summary — public — ARR-at-risk + counts per severity band
// ---------------------------------------------------------------------------
router.get('/summary', async (c) => {
  const workspaceId = await resolveWorkspaceId(c)
  if (!workspaceId) {
    return c.json({ bands: [], totalArrAtRisk: 0 })
  }

  const rows = await buildStalledRows(workspaceId)

  const bandOrder: Array<'critical' | 'at_risk' | 'watch'> = ['critical', 'at_risk', 'watch']
  const bands = bandOrder.map((band) => {
    const inBand = rows.filter((r) => r.severity === band)
    const arrAtRisk = inBand.reduce((s, r) => s + r.arr_cents, 0)
    const avgOverdue =
      inBand.length > 0
        ? Math.round(inBand.reduce((s, r) => s + r.days_overdue, 0) / inBand.length)
        : 0
    return {
      severity: band,
      count: inBand.length,
      arr_at_risk_cents: arrAtRisk,
      avg_days_overdue: avgOverdue,
    }
  })

  const totalArrAtRisk = rows.reduce((s, r) => s + r.arr_cents, 0)

  return c.json({ bands, totalArrAtRisk, totalStalled: rows.length })
})

export default router
