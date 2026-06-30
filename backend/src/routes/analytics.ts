import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  trackers,
  accounts,
  tracker_milestones,
  journey_templates,
  workspaces,
} from '../db/schema.js'

const router = new Hono()

const DAY_MS = 86_400_000

function daysBetween(from: Date | null | undefined, to: Date | null | undefined): number | null {
  if (!from || !to) return null
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS)
}

// Linear-interpolation percentile over a numeric sample.
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * frac) * 100) / 100
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    median: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
  }
}

async function resolveWorkspaceId(c: any): Promise<string | null> {
  const explicit = c.req.query('workspace_id')
  if (explicit) return explicit
  const userId = c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (userId) {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
    if (ws) return ws.id
  }
  const [anyWs] = await db.select().from(workspaces)
  return anyWs?.id ?? null
}

async function loadScopedTrackers(c: any) {
  const workspaceId = await resolveWorkspaceId(c)
  if (!workspaceId) return { workspaceId: null, trackers: [], accById: new Map() }

  const wsTrackers = await db
    .select()
    .from(trackers)
    .where(eq(trackers.workspace_id, workspaceId))

  const wsAccounts = await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
  const accById = new Map(wsAccounts.map((a) => [a.id, a]))

  // Apply optional filters: segment, template, plan.
  const segment = c.req.query('segment')
  const template = c.req.query('template')
  const plan = c.req.query('plan')

  let filtered = wsTrackers
  if (template) filtered = filtered.filter((t) => t.template_id === template)
  if (segment || plan) {
    filtered = filtered.filter((t) => {
      const acc = accById.get(t.account_id)
      if (!acc) return false
      if (segment && acc.segment_id !== segment) return false
      if (plan && acc.plan !== plan) return false
      return true
    })
  }

  return { workspaceId, trackers: filtered, accById }
}

// ---------------------------------------------------------------------------
// GET /ttv — public — median/p75/p90 days-to-first-value & days-to-go-live
// (filter: segment, template, plan)
// ---------------------------------------------------------------------------
router.get('/ttv', async (c) => {
  const { trackers: ts } = await loadScopedTrackers(c)

  const firstValueDays: number[] = []
  const goLiveDays: number[] = []

  for (const t of ts) {
    const fv = daysBetween(t.started_at, t.first_value_at)
    if (fv !== null && fv >= 0) firstValueDays.push(fv)
    const gl = daysBetween(t.started_at, t.go_live_at)
    if (gl !== null && gl >= 0) goLiveDays.push(gl)
  }

  return c.json({
    firstValue: summarize(firstValueDays),
    goLive: summarize(goLiveDays),
  })
})

// ---------------------------------------------------------------------------
// GET /cohorts — public — TTV by cohort (start month / segment / plan / template)
// ---------------------------------------------------------------------------
router.get('/cohorts', async (c) => {
  const { trackers: ts, accById } = await loadScopedTrackers(c)
  const dimension = (c.req.query('by') ?? 'month').toLowerCase()

  // Resolve template names for labelling.
  const tmpls = await db.select().from(journey_templates)
  const tmplById = new Map(tmpls.map((t) => [t.id, t]))

  function cohortKey(t: typeof trackers.$inferSelect): string {
    const acc = accById.get(t.account_id)
    switch (dimension) {
      case 'segment':
        return acc?.segment_id ?? 'unsegmented'
      case 'plan':
        return acc?.plan || 'no_plan'
      case 'template':
        return t.template_id ?? 'no_template'
      case 'month':
      default: {
        const d = t.started_at ?? t.created_at
        if (!d) return 'unknown'
        const dt = new Date(d)
        return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
      }
    }
  }

  const groups = new Map<string, { fv: number[]; gl: number[]; count: number }>()
  for (const t of ts) {
    const key = cohortKey(t)
    let g = groups.get(key)
    if (!g) {
      g = { fv: [], gl: [], count: 0 }
      groups.set(key, g)
    }
    g.count++
    const fv = daysBetween(t.started_at, t.first_value_at)
    if (fv !== null && fv >= 0) g.fv.push(fv)
    const gl = daysBetween(t.started_at, t.go_live_at)
    if (gl !== null && gl >= 0) g.gl.push(gl)
  }

  function label(key: string): string {
    if (dimension === 'template') return tmplById.get(key)?.name ?? key
    return key
  }

  const cohorts = [...groups.entries()]
    .map(([key, g]) => ({
      cohort: key,
      label: label(key),
      dimension,
      tracker_count: g.count,
      first_value: summarize(g.fv),
      go_live: summarize(g.gl),
    }))
    .sort((a, b) => (a.cohort < b.cohort ? -1 : a.cohort > b.cohort ? 1 : 0))

  return c.json(cohorts)
})

// ---------------------------------------------------------------------------
// GET /stage-funnel — public — avg days per stage across trackers
// ---------------------------------------------------------------------------
router.get('/stage-funnel', async (c) => {
  const { trackers: ts } = await loadScopedTrackers(c)
  const trackerIds = new Set(ts.map((t) => t.id))
  if (trackerIds.size === 0) return c.json([])

  const allMs = await db.select().from(tracker_milestones)
  const scoped = allMs.filter((m) => trackerIds.has(m.tracker_id))

  // Bucket by stage name + position; compute avg completion days, completion
  // rate and avg overdue versus target.
  interface Agg {
    name: string
    category: string
    position: number
    durations: number[]
    targets: number[]
    started: number
    completed: number
    total: number
  }
  const byStage = new Map<string, Agg>()

  for (const m of scoped) {
    const key = `${m.position}::${m.name}`
    let a = byStage.get(key)
    if (!a) {
      a = {
        name: m.name,
        category: m.category,
        position: m.position,
        durations: [],
        targets: [],
        started: 0,
        completed: 0,
        total: 0,
      }
      byStage.set(key, a)
    }
    a.total++
    a.targets.push(m.target_days ?? 0)
    if (m.started_at) a.started++
    if (m.status === 'completed' && m.started_at && m.completed_at) {
      a.completed++
      const dur = daysBetween(m.started_at, m.completed_at)
      if (dur !== null && dur >= 0) a.durations.push(dur)
    }
  }

  const funnel = [...byStage.values()]
    .sort((a, b) => a.position - b.position)
    .map((a) => {
      const avgDays =
        a.durations.length > 0
          ? Math.round((a.durations.reduce((s, d) => s + d, 0) / a.durations.length) * 100) / 100
          : null
      const avgTarget =
        a.targets.length > 0
          ? Math.round((a.targets.reduce((s, d) => s + d, 0) / a.targets.length) * 100) / 100
          : null
      return {
        stage: a.name,
        category: a.category,
        position: a.position,
        total: a.total,
        started: a.started,
        completed: a.completed,
        completion_rate:
          a.total > 0 ? Math.round((a.completed / a.total) * 1000) / 10 : 0,
        avg_days: avgDays,
        avg_target_days: avgTarget,
        avg_overdue_days:
          avgDays !== null && avgTarget !== null
            ? Math.round((avgDays - avgTarget) * 100) / 100
            : null,
        median_days: percentile([...a.durations].sort((x, y) => x - y), 50),
      }
    })

  return c.json(funnel)
})

// ---------------------------------------------------------------------------
// GET /trend — public — TTV trend over time (by completion month)
// ---------------------------------------------------------------------------
router.get('/trend', async (c) => {
  const { trackers: ts } = await loadScopedTrackers(c)
  const metric = (c.req.query('metric') ?? 'go_live').toLowerCase()

  // Group by the month the measured event occurred (first_value or go_live),
  // so each point reflects accounts that hit that milestone that month.
  const groups = new Map<string, number[]>()

  for (const t of ts) {
    let eventDate: Date | null = null
    let value: number | null = null
    if (metric === 'first_value') {
      if (t.first_value_at) {
        eventDate = new Date(t.first_value_at)
        value = daysBetween(t.started_at, t.first_value_at)
      }
    } else {
      if (t.go_live_at) {
        eventDate = new Date(t.go_live_at)
        value = daysBetween(t.started_at, t.go_live_at)
      }
    }
    if (!eventDate || value === null || value < 0) continue
    const key = `${eventDate.getUTCFullYear()}-${String(eventDate.getUTCMonth() + 1).padStart(2, '0')}`
    const list = groups.get(key)
    if (list) list.push(value)
    else groups.set(key, [value])
  }

  const trend = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([month, values]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return {
        month,
        metric,
        count: values.length,
        median: percentile(sorted, 50),
        p75: percentile(sorted, 75),
        p90: percentile(sorted, 90),
        avg: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100,
      }
    })

  return c.json(trend)
})

export default router
