import { Hono } from 'hono'
import { db } from '../db/index.js'
import { team_members, trackers, accounts, workspaces } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

// Resolve the caller's (or any) workspace id from a query param, falling back
// to the first workspace owned by the X-User-Id header when present. Reads are
// public, so when no workspace can be resolved we operate over all rows.
async function resolveWorkspaceId(c: any): Promise<string | null> {
  const q = c.req.query('workspace_id')
  if (q) return q
  const userId = getUserId(c)
  if (!userId) return null
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return ws?.id ?? null
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

interface ManagerMetrics {
  total: number
  active: number
  completed: number
  stalled: number
  onTimeRate: number | null
  avgTtvDays: number | null
  medianTtvDays: number | null
  avgGoLiveDays: number | null
  medianGoLiveDays: number | null
  activeArrCents: number
  totalArrCents: number
}

// Compute per-manager metrics from a set of trackers + the accounts they belong to.
function computeMetrics(
  managerTrackers: (typeof trackers.$inferSelect)[],
  accountById: Map<string, typeof accounts.$inferSelect>,
  stallDays: number,
): ManagerMetrics {
  const now = Date.now()
  let active = 0
  let completed = 0
  let stalled = 0
  let activeArrCents = 0
  let totalArrCents = 0
  let onTimeEligible = 0
  let onTimeHits = 0
  const ttvDays: number[] = []
  const goLiveDays: number[] = []

  for (const t of managerTrackers) {
    const acct = t.account_id ? accountById.get(t.account_id) : undefined
    const arr = acct?.arr_cents ?? 0
    totalArrCents += arr

    const isDone = t.status === 'completed' || !!t.go_live_at
    if (isDone) {
      completed += 1
    } else {
      active += 1
      activeArrCents += arr
      // stalled = no activity for >= stallDays and not completed
      const last = t.last_activity_at ? new Date(t.last_activity_at).getTime() : null
      if (last !== null && now - last >= stallDays * DAY_MS) stalled += 1
    }

    // TTV (days to first value)
    const ttv = daysBetween(t.started_at ?? null, t.first_value_at ?? null)
    if (ttv !== null && ttv >= 0) ttvDays.push(ttv)

    // Days to go-live
    const gl = daysBetween(t.started_at ?? null, t.go_live_at ?? null)
    if (gl !== null && gl >= 0) goLiveDays.push(gl)

    // On-time: gone live by the account target_go_live date
    if (acct?.target_go_live && t.go_live_at) {
      onTimeEligible += 1
      if (new Date(t.go_live_at).getTime() <= new Date(acct.target_go_live).getTime()) {
        onTimeHits += 1
      }
    }
  }

  return {
    total: managerTrackers.length,
    active,
    completed,
    stalled,
    onTimeRate: onTimeEligible > 0 ? onTimeHits / onTimeEligible : null,
    avgTtvDays: avg(ttvDays),
    medianTtvDays: median(ttvDays),
    avgGoLiveDays: avg(goLiveDays),
    medianGoLiveDays: median(goLiveDays),
    activeArrCents,
    totalArrCents,
  }
}

// GET / — public — per-manager scorecards
router.get('/', async (c) => {
  const workspaceId = await resolveWorkspaceId(c)

  const members = workspaceId
    ? await db
        .select()
        .from(team_members)
        .where(eq(team_members.workspace_id, workspaceId))
    : await db.select().from(team_members)

  const allTrackers = workspaceId
    ? await db.select().from(trackers).where(eq(trackers.workspace_id, workspaceId))
    : await db.select().from(trackers)

  const allAccounts = workspaceId
    ? await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
    : await db.select().from(accounts)

  const accountById = new Map(allAccounts.map((a) => [a.id, a]))

  // default stall threshold from workspace, else 7
  let stallDays = 7
  if (workspaceId) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
    if (ws?.default_stall_days) stallDays = ws.default_stall_days
  }

  const trackersByManager = new Map<string, (typeof trackers.$inferSelect)[]>()
  for (const t of allTrackers) {
    if (!t.manager_id) continue
    const list = trackersByManager.get(t.manager_id) ?? []
    list.push(t)
    trackersByManager.set(t.manager_id, list)
  }

  const scorecards = members.map((m) => {
    const mt = trackersByManager.get(m.id) ?? []
    const metrics = computeMetrics(mt, accountById, stallDays)
    return {
      manager: m,
      ...metrics,
    }
  })

  // Rank by active load descending for a stable, useful default order.
  scorecards.sort((a, b) => b.active - a.active)

  return c.json(scorecards)
})

// GET /:managerId — public — single manager portfolio + metrics + trackers
router.get('/:managerId', async (c) => {
  const managerId = c.req.param('managerId')
  const [manager] = await db.select().from(team_members).where(eq(team_members.id, managerId))
  if (!manager) return c.json({ error: 'Not found' }, 404)

  const workspaceId = manager.workspace_id

  const portfolio = await db
    .select()
    .from(trackers)
    .where(and(eq(trackers.manager_id, managerId), eq(trackers.workspace_id, workspaceId)))
    .orderBy(desc(trackers.last_activity_at))

  const wsAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.workspace_id, workspaceId))
  const accountById = new Map(wsAccounts.map((a) => [a.id, a]))

  let stallDays = 7
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  if (ws?.default_stall_days) stallDays = ws.default_stall_days

  const metrics = computeMetrics(portfolio, accountById, stallDays)

  const enrichedTrackers = portfolio.map((t) => ({
    ...t,
    account: t.account_id ? accountById.get(t.account_id) ?? null : null,
  }))

  return c.json({ manager, metrics, trackers: enrichedTrackers })
})

export default router
