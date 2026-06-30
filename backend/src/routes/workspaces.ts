import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  workspaces,
  trackers,
  accounts,
  tracker_milestones,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Get-or-create the caller's single workspace.
async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .orderBy(workspaces.created_at)
    .limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.max(0, (tb - ta) / DAY_MS)
}

function monthKey(d: Date | null): string {
  if (!d) return 'unknown'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return 'unknown'
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// GET /current — get-or-create the caller's workspace
// ---------------------------------------------------------------------------
router.get('/current', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  return c.json(ws)
})

// ---------------------------------------------------------------------------
// PUT /current — update workspace settings/defaults
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  default_segment_id: z.string().nullable().optional(),
  default_template_id: z.string().nullable().optional(),
  business_days_only: z.boolean().optional(),
  default_stall_days: z.number().int().min(0).optional(),
  settings: z.record(z.unknown()).optional(),
})

router.put('/current', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(workspaces)
    .set({ ...body, updated_at: new Date() })
    .where(and(eq(workspaces.id, ws.id), eq(workspaces.user_id, userId)))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// GET /overview — KPI rollup
// ---------------------------------------------------------------------------
router.get('/overview', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)

  const allTrackers = await db
    .select()
    .from(trackers)
    .where(eq(trackers.workspace_id, ws.id))
    .orderBy(desc(trackers.created_at))

  const allAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.workspace_id, ws.id))

  const accountById = new Map(allAccounts.map((a) => [a.id, a]))
  const stallDays = ws.default_stall_days ?? 7
  const now = Date.now()

  // --- Time-to-value samples (completed onboardings) ---
  const ttfvDays: number[] = []
  const ttglDays: number[] = []
  for (const t of allTrackers) {
    const fv = daysBetween(t.started_at, t.first_value_at)
    if (fv !== null) ttfvDays.push(fv)
    const gl = daysBetween(t.started_at, t.go_live_at)
    if (gl !== null) ttglDays.push(gl)
  }

  const medianTtv = Math.round(median(ttglDays) * 10) / 10
  const medianTimeToFirstValue = Math.round(median(ttfvDays) * 10) / 10

  // --- Counts / status buckets ---
  let active = 0
  let stalled = 0
  let completed = 0
  let arrAtRiskCents = 0

  for (const t of allTrackers) {
    const isLive = t.status === 'live' || t.status === 'completed' || !!t.go_live_at
    if (isLive) {
      completed += 1
      continue
    }
    active += 1
    const lastActivity = t.last_activity_at ? new Date(t.last_activity_at).getTime() : null
    const idleDays = lastActivity !== null ? (now - lastActivity) / DAY_MS : null
    const isStalled = idleDays !== null && idleDays >= stallDays
    if (isStalled) {
      stalled += 1
      const acct = accountById.get(t.account_id)
      arrAtRiskCents += acct?.arr_cents ?? 0
    }
  }

  // --- On-time rate: live trackers that hit go-live on/before target ---
  let onTimeEligible = 0
  let onTimeHits = 0
  for (const t of allTrackers) {
    if (!t.go_live_at) continue
    const acct = accountById.get(t.account_id)
    if (!acct?.target_go_live) continue
    onTimeEligible += 1
    if (new Date(t.go_live_at).getTime() <= new Date(acct.target_go_live).getTime()) {
      onTimeHits += 1
    }
  }
  const onTimeRate = onTimeEligible > 0 ? Math.round((onTimeHits / onTimeEligible) * 1000) / 10 : 0

  // --- Trends: median go-live TTV by start month (last 6 months present) ---
  const monthBuckets = new Map<string, number[]>()
  for (const t of allTrackers) {
    const gl = daysBetween(t.started_at, t.go_live_at)
    if (gl === null) continue
    const key = monthKey(t.started_at)
    if (!monthBuckets.has(key)) monthBuckets.set(key, [])
    monthBuckets.get(key)!.push(gl)
  }
  const trends = [...monthBuckets.entries()]
    .filter(([k]) => k !== 'unknown')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, vals]) => ({
      month,
      medianTtv: Math.round(median(vals) * 10) / 10,
      count: vals.length,
    }))

  // --- Funnel: trackers reaching each milestone position completed ---
  const trackerIds = allTrackers.map((t) => t.id)
  const tmRows = trackerIds.length
    ? await db.select().from(tracker_milestones)
    : []
  const relevantTm = tmRows.filter((m) => trackerIds.includes(m.tracker_id))

  // Build funnel by milestone name across trackers (started vs completed).
  const funnelMap = new Map<string, { started: number; completed: number; position: number }>()
  for (const m of relevantTm) {
    const key = m.name
    if (!funnelMap.has(key)) funnelMap.set(key, { started: 0, completed: 0, position: m.position })
    const entry = funnelMap.get(key)!
    if (m.status === 'in_progress' || m.status === 'completed' || m.started_at) entry.started += 1
    if (m.status === 'completed' || m.completed_at) entry.completed += 1
  }
  const funnel = [...funnelMap.entries()]
    .map(([name, v]) => ({ name, position: v.position, started: v.started, completed: v.completed }))
    .sort((a, b) => a.position - b.position)

  return c.json({
    kpis: {
      medianTtv,
      medianTimeToFirstValue,
      onTimeRate,
      arrAtRiskCents,
      active,
      stalled,
      completed,
      total: allTrackers.length,
    },
    trends,
    funnel,
  })
})

export default router
