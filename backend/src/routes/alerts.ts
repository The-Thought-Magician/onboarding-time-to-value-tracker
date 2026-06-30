import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { alert_rules, workspaces } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Resolve workspace for public reads: prefer ?workspace_id, else caller's first.
async function resolveWorkspaceId(c: any): Promise<string | null> {
  const q = c.req.query('workspace_id')
  if (q) return q
  const userId = getUserId(c)
  if (!userId) return null
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  return ws?.id ?? null
}

// Get-or-create the caller's workspace for writes.
async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

const alertSchema = z.object({
  name: z.string().min(1),
  metric: z
    .enum(['days_overdue', 'days_to_first_value', 'days_to_go_live', 'risk_score', 'stalled_days'])
    .default('days_overdue'),
  comparator: z.enum(['gte', 'gt', 'lte', 'lt', 'eq']).default('gte'),
  threshold: z.number(),
  severity: z.enum(['watch', 'at_risk', 'critical']).default('at_risk'),
  active: z.boolean().optional().default(true),
})

// GET / — public — list alert rules
router.get('/', async (c) => {
  const workspaceId = await resolveWorkspaceId(c)
  const rows = workspaceId
    ? await db
        .select()
        .from(alert_rules)
        .where(eq(alert_rules.workspace_id, workspaceId))
        .orderBy(desc(alert_rules.created_at))
    : await db.select().from(alert_rules).orderBy(desc(alert_rules.created_at))
  return c.json(rows)
})

// POST / — auth — create rule
router.post('/', authMiddleware, zValidator('json', alertSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const ws = await getOrCreateWorkspace(userId)
  const [rule] = await db
    .insert(alert_rules)
    .values({ ...body, workspace_id: ws.id, user_id: userId })
    .returning()
  return c.json(rule, 201)
})

// PUT /:id — auth — update rule
router.put('/:id', authMiddleware, zValidator('json', alertSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(alert_rules).where(eq(alert_rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(alert_rules)
    .set(body)
    .where(eq(alert_rules.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — auth — delete rule
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(alert_rules).where(eq(alert_rules.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(alert_rules).where(eq(alert_rules.id, id))
  return c.json({ success: true })
})

export default router
