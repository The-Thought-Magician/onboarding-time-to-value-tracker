import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  report_definitions,
  report_snapshots,
  workspaces,
  trackers,
  accounts,
  blockers,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

async function getWorkspaceFor(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return existing ?? null
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS))
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((x, y) => x - y)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function median(values: number[]): number | null {
  return percentile(values, 50)
}

// Compute the full metric set for a workspace at "now". The report definition's
// `metrics` array selects which slices are returned in the snapshot.
async function computeMetrics(workspaceId: string) {
  const trk = await db.select().from(trackers).where(eq(trackers.workspace_id, workspaceId))
  const accts = await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
  const blk = await db.select().from(blockers).where(eq(blockers.workspace_id, workspaceId))
  const acctById = new Map(accts.map((a) => [a.id, a]))

  const firstValueDays: number[] = []
  const goLiveDays: number[] = []
  for (const t of trk) {
    const fv = daysBetween(t.started_at, t.first_value_at)
    if (fv !== null) firstValueDays.push(fv)
    const gl = daysBetween(t.started_at, t.go_live_at)
    if (gl !== null) goLiveDays.push(gl)
  }

  const activeCount = trk.filter((t) => t.status === 'in_progress').length
  const stalledCount = trk.filter((t) => t.status === 'stalled').length
  const completedCount = trk.filter((t) => t.status === 'live' || t.go_live_at !== null).length

  // On-time: trackers gone live on/before account target_go_live.
  let onTime = 0
  let withTarget = 0
  for (const t of trk) {
    if (!t.go_live_at) continue
    const acct = acctById.get(t.account_id)
    if (!acct?.target_go_live) continue
    withTarget += 1
    if (t.go_live_at.getTime() <= acct.target_go_live.getTime()) onTime += 1
  }

  const arrAtRisk = trk
    .filter((t) => t.status === 'stalled')
    .reduce((sum, t) => sum + (acctById.get(t.account_id)?.arr_cents ?? 0), 0)

  const openBlockers = blk.filter((b) => b.status === 'open').length

  return {
    generated_at: new Date().toISOString(),
    ttv: {
      firstValue: {
        median: median(firstValueDays),
        p75: percentile(firstValueDays, 75),
        p90: percentile(firstValueDays, 90),
        sample: firstValueDays.length,
      },
      goLive: {
        median: median(goLiveDays),
        p75: percentile(goLiveDays, 75),
        p90: percentile(goLiveDays, 90),
        sample: goLiveDays.length,
      },
    },
    counts: {
      trackers: trk.length,
      active: activeCount,
      stalled: stalledCount,
      completed: completedCount,
      accounts: accts.length,
      openBlockers,
    },
    onTime: {
      rate: withTarget ? onTime / withTarget : null,
      onTime,
      withTarget,
    },
    arrAtRiskCents: arrAtRisk,
  }
}

const reportSchema = z.object({
  name: z.string().min(1),
  metrics: z.array(z.string()).optional().default([]),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  schedule: z.string().optional().default(''),
})

// GET / — public — list report definitions (scoped by ?user= if provided)
router.get('/', async (c) => {
  const userId = c.req.query('user') ?? c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  if (userId) {
    const ws = await getWorkspaceFor(userId)
    if (!ws) return c.json([])
    const rows = await db
      .select()
      .from(report_definitions)
      .where(eq(report_definitions.workspace_id, ws.id))
      .orderBy(desc(report_definitions.created_at))
    return c.json(rows)
  }
  const rows = await db
    .select()
    .from(report_definitions)
    .orderBy(desc(report_definitions.created_at))
  return c.json(rows)
})

// GET /snapshots — public — list snapshots (optional ?definition= filter)
router.get('/snapshots', async (c) => {
  const defId = c.req.query('definition')
  const userId = c.req.query('user') ?? c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const conds = []
  if (userId) {
    const ws = await getWorkspaceFor(userId)
    if (!ws) return c.json([])
    conds.push(eq(report_snapshots.workspace_id, ws.id))
  }
  if (defId) conds.push(eq(report_snapshots.report_definition_id, defId))
  const rows = await db
    .select()
    .from(report_snapshots)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(report_snapshots.created_at))
  return c.json(rows)
})

// GET /snapshots/:sid — public — snapshot detail
router.get('/snapshots/:sid', async (c) => {
  const [snap] = await db
    .select()
    .from(report_snapshots)
    .where(eq(report_snapshots.id, c.req.param('sid')))
  if (!snap) return c.json({ error: 'Not found' }, 404)
  return c.json(snap)
})

// POST / — auth — create report definition
router.post('/', authMiddleware, zValidator('json', reportSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const ws = await getOrCreateWorkspace(userId)
  const [created] = await db
    .insert(report_definitions)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: body.name,
      metrics: body.metrics,
      filters: body.filters,
      schedule: body.schedule,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — auth — update definition
router.put(
  '/:id',
  authMiddleware,
  zValidator('json', reportSchema.partial()),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [existing] = await db
      .select()
      .from(report_definitions)
      .where(eq(report_definitions.id, id))
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const body = c.req.valid('json')
    const [updated] = await db
      .update(report_definitions)
      .set(body)
      .where(eq(report_definitions.id, id))
      .returning()
    return c.json(updated)
  },
)

// DELETE /:id — auth — delete definition
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(report_definitions)
    .where(eq(report_definitions.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(report_definitions).where(eq(report_definitions.id, id))
  return c.json({ success: true })
})

// POST /:id/run — auth — compute a snapshot from the definition + current data
router.post('/:id/run', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [def] = await db
    .select()
    .from(report_definitions)
    .where(eq(report_definitions.id, id))
  if (!def) return c.json({ error: 'Not found' }, 404)
  if (def.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const metrics = await computeMetrics(def.workspace_id)
  const requested = def.metrics ?? []
  // Filter the full metric block down to the requested slices when specified.
  let data: Record<string, unknown> = metrics as unknown as Record<string, unknown>
  if (requested.length) {
    const picked: Record<string, unknown> = { generated_at: metrics.generated_at }
    for (const key of requested) {
      if (key in metrics) picked[key] = (metrics as Record<string, unknown>)[key]
    }
    data = picked
  }

  const title = `${def.name} — ${new Date().toISOString().slice(0, 10)}`
  const [snap] = await db
    .insert(report_snapshots)
    .values({
      workspace_id: def.workspace_id,
      user_id: userId,
      report_definition_id: def.id,
      title,
      data,
    })
    .returning()
  return c.json(snap, 201)
})

export default router
