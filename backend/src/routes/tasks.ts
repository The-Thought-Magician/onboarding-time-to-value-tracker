import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tasks, team_members, trackers } from '../db/schema.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const taskSchema = z.object({
  tracker_id: z.string().min(1).optional().nullable(),
  tracker_milestone_id: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  assignee_id: z.string().min(1).optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional().default('open'),
})

const taskUpdateSchema = taskSchema.partial()

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// Public: list tasks (filter: tracker, assignee, status)
router.get('/', async (c) => {
  const trackerId = c.req.query('tracker')
  const assignee = c.req.query('assignee')
  const status = c.req.query('status')
  const conds = []
  if (trackerId) conds.push(eq(tasks.tracker_id, trackerId))
  if (assignee) conds.push(eq(tasks.assignee_id, assignee))
  if (status) conds.push(eq(tasks.status, status))
  const rows = conds.length
    ? await db.select().from(tasks).where(and(...conds)).orderBy(desc(tasks.created_at))
    : await db.select().from(tasks).orderBy(desc(tasks.created_at))
  return c.json(rows)
})

// Auth: caller's assigned + overdue tasks
router.get('/mine', authMiddleware, async (c) => {
  const userId = getUserId(c)
  // Team members in this caller's workspaces that represent the caller, plus
  // any tasks the caller owns directly (user_id). We surface: tasks created by
  // the caller, tasks assigned to a team member the caller owns, and overdue.
  const myMembers = await db
    .select({ id: team_members.id })
    .from(team_members)
    .where(eq(team_members.user_id, userId))
  const memberIds = myMembers.map((m) => m.id)

  const mine = await db
    .select()
    .from(tasks)
    .where(eq(tasks.user_id, userId))
    .orderBy(desc(tasks.created_at))

  let assigned: typeof mine = []
  if (memberIds.length) {
    assigned = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.assignee_id, memberIds))
      .orderBy(desc(tasks.created_at))
  }

  // Merge unique by id
  const byId = new Map<string, (typeof mine)[number]>()
  for (const t of [...mine, ...assigned]) byId.set(t.id, t)
  const merged = [...byId.values()]

  const now = Date.now()
  const open = merged.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const overdue = open.filter((t) => t.due_date && new Date(t.due_date as unknown as string).getTime() < now)

  // Return open tasks first (assigned + owned), overdue flagged via field.
  const result = open
    .map((t) => ({
      ...t,
      overdue: !!(t.due_date && new Date(t.due_date as unknown as string).getTime() < now),
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      const ad = a.due_date ? new Date(a.due_date as unknown as string).getTime() : Infinity
      const bd = b.due_date ? new Date(b.due_date as unknown as string).getTime() : Infinity
      return ad - bd
    })

  return c.json(result)
})

// Auth: create task
router.post('/', authMiddleware, zValidator('json', taskSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Resolve workspace from the linked tracker when present; require ownership.
  let workspaceId: string | null = null
  if (body.tracker_id) {
    const [tr] = await db.select().from(trackers).where(eq(trackers.id, body.tracker_id))
    if (!tr) return c.json({ error: 'Tracker not found' }, 404)
    if (tr.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    workspaceId = tr.workspace_id
  } else {
    // No tracker: derive workspace from any team member or fall back to a
    // workspace the caller owns via team_members; otherwise reject.
    const [member] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.user_id, userId))
    if (!member) return c.json({ error: 'tracker_id required (no workspace context)' }, 400)
    workspaceId = member.workspace_id
  }

  if (body.assignee_id) {
    const [m] = await db.select().from(team_members).where(eq(team_members.id, body.assignee_id))
    if (!m) return c.json({ error: 'Assignee not found' }, 404)
    if (m.workspace_id !== workspaceId) return c.json({ error: 'Assignee not in workspace' }, 400)
  }

  const [created] = await db
    .insert(tasks)
    .values({
      workspace_id: workspaceId!,
      user_id: userId,
      tracker_id: body.tracker_id ?? null,
      tracker_milestone_id: body.tracker_milestone_id ?? null,
      title: body.title,
      description: body.description ?? '',
      assignee_id: body.assignee_id ?? null,
      due_date: toDate(body.due_date),
      status: body.status ?? 'open',
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update task / status
router.put('/:id', authMiddleware, zValidator('json', taskUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  if (body.assignee_id) {
    const [m] = await db.select().from(team_members).where(eq(team_members.id, body.assignee_id))
    if (!m) return c.json({ error: 'Assignee not found' }, 404)
    if (m.workspace_id !== existing.workspace_id) return c.json({ error: 'Assignee not in workspace' }, 400)
  }

  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.description !== undefined) patch.description = body.description
  if (body.tracker_id !== undefined) patch.tracker_id = body.tracker_id
  if (body.tracker_milestone_id !== undefined) patch.tracker_milestone_id = body.tracker_milestone_id
  if (body.assignee_id !== undefined) patch.assignee_id = body.assignee_id
  if (body.due_date !== undefined) patch.due_date = toDate(body.due_date)
  if (body.status !== undefined) patch.status = body.status

  const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning()
  return c.json(updated)
})

// Auth: delete task
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(tasks).where(eq(tasks.id, id))
  return c.json({ success: true })
})

export default router
