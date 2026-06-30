import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  team_members,
  trackers,
  workspaces,
  accounts,
} from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Workspace resolution: every member belongs to the caller's (or a) workspace.
// For public reads we scope by the most-recent workspace; for writes we
// get-or-create the caller's workspace and assert ownership.
// ---------------------------------------------------------------------------
async function getOrCreateWorkspace(userId: string) {
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .limit(1)
  if (existing.length > 0) return existing[0]
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

const memberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')).default(''),
  role: z.string().min(1).optional().default('implementation_manager'),
  target_load: z.number().int().min(0).optional().default(10),
  active: z.boolean().optional().default(true),
})

// ---------------------------------------------------------------------------
// GET / — public — list team members (optionally filter by workspace / active)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const activeParam = c.req.query('active')
  const conds = []
  if (workspaceId) conds.push(eq(team_members.workspace_id, workspaceId))
  if (activeParam === 'true') conds.push(eq(team_members.active, true))
  if (activeParam === 'false') conds.push(eq(team_members.active, false))
  const rows = conds.length
    ? await db
        .select()
        .from(team_members)
        .where(and(...conds))
    : await db.select().from(team_members)
  rows.sort((a, b) => a.name.localeCompare(b.name))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /capacity — public — active-load vs target-load per member.
// active load = number of trackers with status 'in_progress' assigned to a
// member as manager.
// ---------------------------------------------------------------------------
router.get('/capacity', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const members = workspaceId
    ? await db
        .select()
        .from(team_members)
        .where(eq(team_members.workspace_id, workspaceId))
    : await db.select().from(team_members)

  if (members.length === 0) return c.json([])

  const workspaceIds = [...new Set(members.map((m) => m.workspace_id))]
  const allTrackers = await db
    .select()
    .from(trackers)
    .where(inArray(trackers.workspace_id, workspaceIds))

  // accounts -> arr for ARR-weighted load
  const accountIds = [...new Set(allTrackers.map((t) => t.account_id))]
  const acctRows = accountIds.length
    ? await db.select().from(accounts).where(inArray(accounts.id, accountIds))
    : []
  const arrByAccount = new Map(acctRows.map((a) => [a.id, a.arr_cents ?? 0]))

  const rows = members.map((m) => {
    const mine = allTrackers.filter((t) => t.manager_id === m.id)
    const active = mine.filter((t) => t.status === 'in_progress')
    const activeLoad = active.length
    const totalLoad = mine.length
    const target = m.target_load ?? 0
    const arrManaged = active.reduce(
      (sum, t) => sum + (arrByAccount.get(t.account_id) ?? 0),
      0,
    )
    const utilizationPct = target > 0 ? Math.round((activeLoad / target) * 100) : null
    let status: 'under' | 'balanced' | 'over' = 'balanced'
    if (target > 0) {
      if (activeLoad > target) status = 'over'
      else if (activeLoad < Math.floor(target * 0.6)) status = 'under'
    }
    return {
      member: m,
      member_id: m.id,
      name: m.name,
      role: m.role,
      active_load: activeLoad,
      total_load: totalLoad,
      target_load: target,
      available: Math.max(0, target - activeLoad),
      utilization_pct: utilizationPct,
      arr_managed_cents: arrManaged,
      status,
    }
  })

  rows.sort((a, b) => b.active_load - a.active_load)
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — create member
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', memberSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const ws = await getOrCreateWorkspace(userId)
  const [created] = await db
    .insert(team_members)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: body.name,
      email: body.email ?? '',
      role: body.role ?? 'implementation_manager',
      target_load: body.target_load ?? 10,
      active: body.active ?? true,
    })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update member (ownership enforced)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', memberSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(team_members).where(eq(team_members.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.email !== undefined) patch.email = body.email
  if (body.role !== undefined) patch.role = body.role
  if (body.target_load !== undefined) patch.target_load = body.target_load
  if (body.active !== undefined) patch.active = body.active
  if (Object.keys(patch).length === 0) return c.json(existing)
  const [updated] = await db
    .update(team_members)
    .set(patch)
    .where(eq(team_members.id, id))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete member (ownership enforced)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(team_members).where(eq(team_members.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(team_members).where(eq(team_members.id, id))
  return c.json({ success: true })
})

export default router
