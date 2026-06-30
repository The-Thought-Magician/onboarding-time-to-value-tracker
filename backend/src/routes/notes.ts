import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { notes, trackers, tracker_milestones } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// GET / — public — list notes (filter: tracker)
// Pinned notes first, then newest. Optional milestone filter.
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const tracker = c.req.query('tracker')
  const milestone = c.req.query('milestone')
  const visibleOnly = c.req.query('customer_visible')

  const conds = []
  if (tracker) conds.push(eq(notes.tracker_id, tracker))
  if (milestone) conds.push(eq(notes.tracker_milestone_id, milestone))
  if (visibleOnly === 'true') conds.push(eq(notes.customer_visible, true))

  const rows = await db
    .select()
    .from(notes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(notes.pinned), desc(notes.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST / — auth — create note
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  tracker_id: z.string().min(1),
  tracker_milestone_id: z.string().optional().nullable(),
  author: z.string().optional().default(''),
  body: z.string().min(1),
  customer_visible: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
})

router.post('/', authMiddleware, zValidator('json', noteSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, body.tracker_id))
  if (!tracker) return c.json({ error: 'Tracker not found' }, 404)
  if (tracker.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // If a milestone is provided, ensure it belongs to this tracker.
  if (body.tracker_milestone_id) {
    const [m] = await db
      .select()
      .from(tracker_milestones)
      .where(
        and(
          eq(tracker_milestones.id, body.tracker_milestone_id),
          eq(tracker_milestones.tracker_id, body.tracker_id),
        ),
      )
    if (!m) return c.json({ error: 'Milestone does not belong to tracker' }, 400)
  }

  const [created] = await db
    .insert(notes)
    .values({
      workspace_id: tracker.workspace_id,
      user_id: userId,
      tracker_id: body.tracker_id,
      tracker_milestone_id: body.tracker_milestone_id ?? null,
      author: body.author,
      body: body.body,
      customer_visible: body.customer_visible,
      pinned: body.pinned,
    })
    .returning()
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update / pin / visibility
// ---------------------------------------------------------------------------
const updateNoteSchema = z.object({
  body: z.string().min(1).optional(),
  author: z.string().optional(),
  customer_visible: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tracker_milestone_id: z.string().optional().nullable(),
})

router.put('/:id', authMiddleware, zValidator('json', updateNoteSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notes).where(eq(notes.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.body !== undefined) patch.body = body.body
  if (body.author !== undefined) patch.author = body.author
  if (body.customer_visible !== undefined) patch.customer_visible = body.customer_visible
  if (body.pinned !== undefined) patch.pinned = body.pinned
  if (body.tracker_milestone_id !== undefined) patch.tracker_milestone_id = body.tracker_milestone_id

  const [updated] = await db.update(notes).set(patch).where(eq(notes.id, id)).returning()
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notes).where(eq(notes.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(notes).where(eq(notes.id, id))
  return c.json({ success: true })
})

export default router
