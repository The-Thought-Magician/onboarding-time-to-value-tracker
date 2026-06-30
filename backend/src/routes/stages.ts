import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { stages, workspaces } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Resolve (or create) the caller's workspace. Used for auth-gated writes.
async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

// Resolve the caller's workspace id without creating one (public reads).
async function findWorkspaceId(userId: string): Promise<string | null> {
  if (!userId) return null
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return ws?.id ?? null
}

const stageSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1).optional().default('setup'),
  default_target_days: z.number().int().min(0).optional().default(5),
  owner_role: z.string().optional().default('implementation_manager'),
  weight: z.number().optional().default(1),
  checklist: z.array(z.string()).optional().default([]),
})

// Public: list stage library (scoped to caller's workspace when identified).
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsId = await findWorkspaceId(userId)
  if (!wsId) return c.json([])
  const all = await db
    .select()
    .from(stages)
    .where(eq(stages.workspace_id, wsId))
    .orderBy(desc(stages.created_at))
  return c.json(all)
})

// Public: stage detail.
router.get('/:id', async (c) => {
  const [s] = await db.select().from(stages).where(eq(stages.id, c.req.param('id')))
  if (!s) return c.json({ error: 'Not found' }, 404)
  return c.json(s)
})

// Auth: create stage.
router.post('/', authMiddleware, zValidator('json', stageSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(stages)
    .values({ ...body, workspace_id: ws.id, user_id: userId })
    .returning()
  return c.json(created, 201)
})

// Auth: update stage (ownership enforced).
router.put('/:id', authMiddleware, zValidator('json', stageSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(stages).where(eq(stages.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(stages).set(body).where(eq(stages.id, id)).returning()
  return c.json(updated)
})

// Auth: delete stage (ownership enforced).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(stages).where(eq(stages.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(stages).where(eq(stages.id, id))
  return c.json({ success: true })
})

export default router
