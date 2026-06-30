import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { saved_views, workspaces } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Resolve (or lazily create) the caller's workspace. Every saved view is
// scoped to a workspace + user_id for ownership.
// ---------------------------------------------------------------------------
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

const viewSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1).optional().default('tracker'),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  pinned: z.boolean().optional().default(false),
})

// GET / — public — list saved views (optional ?kind= filter, ?user= scope)
router.get('/', async (c) => {
  const kind = c.req.query('kind')
  const userId = c.req.query('user') ?? c.req.header('X-User-Id') ?? c.req.header('x-user-id')
  const conds = []
  if (userId) {
    const ws = await getWorkspaceFor(userId)
    if (!ws) return c.json([])
    conds.push(eq(saved_views.workspace_id, ws.id))
  }
  if (kind) conds.push(eq(saved_views.kind, kind))
  const rows = await db
    .select()
    .from(saved_views)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(saved_views.pinned), desc(saved_views.created_at))
  return c.json(rows)
})

// POST / — auth — create saved view / cohort
router.post('/', authMiddleware, zValidator('json', viewSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const ws = await getOrCreateWorkspace(userId)
  const [created] = await db
    .insert(saved_views)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: body.name,
      kind: body.kind,
      filters: body.filters,
      pinned: body.pinned,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — auth — update / pin
router.put(
  '/:id',
  authMiddleware,
  zValidator('json', viewSchema.partial()),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [existing] = await db.select().from(saved_views).where(eq(saved_views.id, id))
    if (!existing) return c.json({ error: 'Not found' }, 404)
    if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const body = c.req.valid('json')
    const [updated] = await db
      .update(saved_views)
      .set(body)
      .where(eq(saved_views.id, id))
      .returning()
    return c.json(updated)
  },
)

// DELETE /:id — auth — delete
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(saved_views).where(eq(saved_views.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(saved_views).where(eq(saved_views.id, id))
  return c.json({ success: true })
})

export default router
