import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, ilike } from 'drizzle-orm'
import { db } from '../db/index.js'
import { accounts, trackers, workspaces } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

async function findWorkspaceId(userId: string): Promise<string | null> {
  if (!userId) return null
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return ws?.id ?? null
}

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? null : d
}

const accountSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().default(''),
  segment_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  plan: z.string().optional().default(''),
  arr_cents: z.number().int().min(0).optional().default(0),
  contract_start: z.string().nullable().optional(),
  target_go_live: z.string().nullable().optional(),
  cs_owner_id: z.string().nullable().optional(),
  health: z.string().optional().default('on_track'),
})

// Public: list accounts (filter: segment, health, q) scoped to caller's workspace.
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsId = await findWorkspaceId(userId)
  if (!wsId) return c.json([])

  const segment = c.req.query('segment')
  const health = c.req.query('health')
  const q = c.req.query('q')

  const conditions = [eq(accounts.workspace_id, wsId)]
  if (segment) conditions.push(eq(accounts.segment_id, segment))
  if (health) conditions.push(eq(accounts.health, health))
  if (q) conditions.push(ilike(accounts.name, `%${q}%`))

  const rows = await db
    .select()
    .from(accounts)
    .where(and(...conditions))
    .orderBy(desc(accounts.created_at))
  return c.json(rows)
})

// Public: account + linked tracker summary.
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id))
  if (!account) return c.json({ error: 'Not found' }, 404)
  const [tracker] = await db.select().from(trackers).where(eq(trackers.account_id, id))
  return c.json({ account, tracker: tracker ?? null })
})

// Auth: create account.
router.post('/', authMiddleware, zValidator('json', accountSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(accounts)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: body.name,
      domain: body.domain ?? '',
      segment_id: body.segment_id ?? null,
      product_id: body.product_id ?? null,
      plan: body.plan ?? '',
      arr_cents: body.arr_cents ?? 0,
      contract_start: parseDate(body.contract_start),
      target_go_live: parseDate(body.target_go_live),
      cs_owner_id: body.cs_owner_id ?? null,
      health: body.health ?? 'on_track',
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update account (ownership enforced).
router.put('/:id', authMiddleware, zValidator('json', accountSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(accounts).where(eq(accounts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.domain !== undefined) updates.domain = body.domain
  if (body.segment_id !== undefined) updates.segment_id = body.segment_id ?? null
  if (body.product_id !== undefined) updates.product_id = body.product_id ?? null
  if (body.plan !== undefined) updates.plan = body.plan
  if (body.arr_cents !== undefined) updates.arr_cents = body.arr_cents
  if (body.contract_start !== undefined) updates.contract_start = parseDate(body.contract_start)
  if (body.target_go_live !== undefined) updates.target_go_live = parseDate(body.target_go_live)
  if (body.cs_owner_id !== undefined) updates.cs_owner_id = body.cs_owner_id ?? null
  if (body.health !== undefined) updates.health = body.health

  const [updated] = await db.update(accounts).set(updates).where(eq(accounts.id, id)).returning()
  return c.json(updated)
})

// Auth: delete account (ownership enforced).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(accounts).where(eq(accounts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(accounts).where(eq(accounts.id, id))
  return c.json({ success: true })
})

export default router
