import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { segments, workspaces } from '../db/schema.js'
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

const segmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  color: z.string().optional().default('#6366f1'),
})

// ---------------------------------------------------------------------------
// GET / — public — list segments (optional ?workspace_id= or ?user_id= filter)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const userId = c.req.query('user_id')
  const rows = await db
    .select()
    .from(segments)
    .where(
      workspaceId
        ? eq(segments.workspace_id, workspaceId)
        : userId
          ? eq(segments.user_id, userId)
          : undefined,
    )
    .orderBy(desc(segments.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — segment detail
// ---------------------------------------------------------------------------
router.get('/:id', async (c) => {
  const [row] = await db.select().from(segments).where(eq(segments.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// ---------------------------------------------------------------------------
// POST / — auth — create segment
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', segmentSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(segments)
    .values({ ...body, workspace_id: ws.id, user_id: userId })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update (ownership)
// ---------------------------------------------------------------------------
router.put('/:id', authMiddleware, zValidator('json', segmentSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(segments).where(eq(segments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(segments)
    .set(body)
    .where(and(eq(segments.id, id), eq(segments.user_id, userId)))
    .returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete (ownership)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(segments).where(eq(segments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(segments).where(and(eq(segments.id, id), eq(segments.user_id, userId)))
  return c.json({ success: true })
})

export default router
