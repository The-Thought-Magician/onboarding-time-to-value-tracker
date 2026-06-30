import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, asc, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { journey_templates, template_milestones, workspaces } from '../db/schema.js'
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

// Recompute and persist a template's total_target_days from its milestones.
async function recomputeTotalTargetDays(templateId: string): Promise<number> {
  const ms = await db
    .select()
    .from(template_milestones)
    .where(eq(template_milestones.template_id, templateId))
  const total = ms.reduce((sum, m) => sum + (m.target_days ?? 0), 0)
  await db
    .update(journey_templates)
    .set({ total_target_days: total, updated_at: new Date() })
    .where(eq(journey_templates.id, templateId))
  return total
}

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  segment_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  version: z.number().int().min(1).optional(),
  status: z.string().optional(),
  is_default: z.boolean().optional(),
})

const milestoneSchema = z.object({
  stage_id: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.string().optional().default('setup'),
  position: z.number().int().min(0).optional(),
  target_days: z.number().int().min(0).optional().default(5),
  owner_role: z.string().optional().default('implementation_manager'),
  weight: z.number().optional().default(1),
  is_first_value: z.boolean().optional().default(false),
  is_go_live: z.boolean().optional().default(false),
  exit_criteria: z.string().optional().default(''),
  checklist: z.array(z.string()).optional().default([]),
})

const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
})

// Public: list journey templates (scoped to caller's workspace).
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsId = await findWorkspaceId(userId)
  if (!wsId) return c.json([])
  const all = await db
    .select()
    .from(journey_templates)
    .where(eq(journey_templates.workspace_id, wsId))
    .orderBy(desc(journey_templates.created_at))
  return c.json(all)
})

// Public: template + ordered milestones.
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [template] = await db
    .select()
    .from(journey_templates)
    .where(eq(journey_templates.id, id))
  if (!template) return c.json({ error: 'Not found' }, 404)
  const milestones = await db
    .select()
    .from(template_milestones)
    .where(eq(template_milestones.template_id, id))
    .orderBy(asc(template_milestones.position))
  return c.json({ template, milestones })
})

// Auth: create template.
router.post('/', authMiddleware, zValidator('json', templateSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(journey_templates)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: body.name,
      description: body.description ?? '',
      segment_id: body.segment_id ?? null,
      product_id: body.product_id ?? null,
      version: body.version ?? 1,
      status: body.status ?? 'active',
      is_default: body.is_default ?? false,
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update template.
router.put('/:id', authMiddleware, zValidator('json', templateSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(journey_templates)
    .set({ ...body, updated_at: new Date() })
    .where(eq(journey_templates.id, id))
    .returning()
  return c.json(updated)
})

// Auth: clone template (deep copy of template + milestones, bumped version).
router.post('/:id/clone', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const id = c.req.param('id')
  const [src] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
  if (!src) return c.json({ error: 'Not found' }, 404)
  if (src.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [clone] = await db
    .insert(journey_templates)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: `${src.name} (copy)`,
      description: src.description ?? '',
      segment_id: src.segment_id ?? null,
      product_id: src.product_id ?? null,
      version: (src.version ?? 1) + 1,
      status: 'active',
      total_target_days: src.total_target_days ?? 0,
      is_default: false,
    })
    .returning()

  const srcMilestones = await db
    .select()
    .from(template_milestones)
    .where(eq(template_milestones.template_id, id))
    .orderBy(asc(template_milestones.position))

  for (const m of srcMilestones) {
    await db.insert(template_milestones).values({
      template_id: clone.id,
      stage_id: m.stage_id ?? null,
      name: m.name,
      description: m.description ?? '',
      category: m.category,
      position: m.position,
      target_days: m.target_days,
      owner_role: m.owner_role ?? 'implementation_manager',
      weight: m.weight ?? 1,
      is_first_value: m.is_first_value,
      is_go_live: m.is_go_live,
      exit_criteria: m.exit_criteria ?? '',
      checklist: m.checklist ?? [],
    })
  }

  return c.json(clone, 201)
})

// Auth: archive/delete template (removes its milestones first).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(template_milestones).where(eq(template_milestones.template_id, id))
  await db.delete(journey_templates).where(eq(journey_templates.id, id))
  return c.json({ success: true })
})

// Auth: add milestone to a template (appends at end unless position given).
router.post('/:id/milestones', authMiddleware, zValidator('json', milestoneSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [template] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
  if (!template) return c.json({ error: 'Not found' }, 404)
  if (template.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  let position = body.position
  if (position === undefined) {
    const existing = await db
      .select()
      .from(template_milestones)
      .where(eq(template_milestones.template_id, id))
    position = existing.length
  }

  const [created] = await db
    .insert(template_milestones)
    .values({
      template_id: id,
      stage_id: body.stage_id ?? null,
      name: body.name,
      description: body.description ?? '',
      category: body.category ?? 'setup',
      position,
      target_days: body.target_days ?? 5,
      owner_role: body.owner_role ?? 'implementation_manager',
      weight: body.weight ?? 1,
      is_first_value: body.is_first_value ?? false,
      is_go_live: body.is_go_live ?? false,
      exit_criteria: body.exit_criteria ?? '',
      checklist: body.checklist ?? [],
    })
    .returning()

  await recomputeTotalTargetDays(id)
  return c.json(created, 201)
})

// Auth: update a template milestone.
router.put(
  '/:id/milestones/:mid',
  authMiddleware,
  zValidator('json', milestoneSchema.partial()),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const mid = c.req.param('mid')
    const [template] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
    if (!template) return c.json({ error: 'Not found' }, 404)
    if (template.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const [existing] = await db
      .select()
      .from(template_milestones)
      .where(and(eq(template_milestones.id, mid), eq(template_milestones.template_id, id)))
    if (!existing) return c.json({ error: 'Not found' }, 404)
    const body = c.req.valid('json')
    const [updated] = await db
      .update(template_milestones)
      .set(body)
      .where(eq(template_milestones.id, mid))
      .returning()
    await recomputeTotalTargetDays(id)
    return c.json(updated)
  },
)

// Auth: delete a template milestone (reindexes remaining positions).
router.delete('/:id/milestones/:mid', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const mid = c.req.param('mid')
  const [template] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
  if (!template) return c.json({ error: 'Not found' }, 404)
  if (template.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [existing] = await db
    .select()
    .from(template_milestones)
    .where(and(eq(template_milestones.id, mid), eq(template_milestones.template_id, id)))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.delete(template_milestones).where(eq(template_milestones.id, mid))

  // Reindex remaining milestones to contiguous positions.
  const remaining = await db
    .select()
    .from(template_milestones)
    .where(eq(template_milestones.template_id, id))
    .orderBy(asc(template_milestones.position))
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].position !== i) {
      await db
        .update(template_milestones)
        .set({ position: i })
        .where(eq(template_milestones.id, remaining[i].id))
    }
  }

  await recomputeTotalTargetDays(id)
  return c.json({ success: true })
})

// Auth: reorder milestones via an explicit id ordering.
router.put(
  '/:id/milestones/reorder',
  authMiddleware,
  zValidator('json', reorderSchema),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [template] = await db.select().from(journey_templates).where(eq(journey_templates.id, id))
    if (!template) return c.json({ error: 'Not found' }, 404)
    if (template.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    const { order } = c.req.valid('json')

    const existing = await db
      .select()
      .from(template_milestones)
      .where(eq(template_milestones.template_id, id))
    const validIds = new Set(existing.map((m) => m.id))

    let position = 0
    for (const mid of order) {
      if (!validIds.has(mid)) continue
      await db
        .update(template_milestones)
        .set({ position })
        .where(eq(template_milestones.id, mid))
      position++
    }

    const reordered = await db
      .select()
      .from(template_milestones)
      .where(eq(template_milestones.template_id, id))
      .orderBy(asc(template_milestones.position))
    return c.json(reordered)
  },
)

export default router
