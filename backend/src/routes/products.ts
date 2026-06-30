import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { products, workspaces } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Get-or-create the caller's workspace (writes are scoped to it).
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

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
})

// ---------------------------------------------------------------------------
// GET / — public — list products (optional ?workspace_id= or ?user_id= filter)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const userId = c.req.query('user_id')
  const rows = await db
    .select()
    .from(products)
    .where(
      workspaceId
        ? eq(products.workspace_id, workspaceId)
        : userId
          ? eq(products.user_id, userId)
          : undefined,
    )
    .orderBy(desc(products.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — create product
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', productSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(products)
    .values({ ...body, workspace_id: ws.id, user_id: userId })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update (ownership)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', productSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(products).where(eq(products.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(products)
    .set(body)
    .where(and(eq(products.id, id), eq(products.user_id, userId)))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete (ownership)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(products).where(eq(products.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(products).where(and(eq(products.id, id), eq(products.user_id, userId)))
  return c.json({ success: true })
})

export default router
