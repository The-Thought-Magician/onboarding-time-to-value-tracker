import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { activities, trackers, accounts, team_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const activitySchema = z.object({
  tracker_id: z.string().min(1).optional().nullable(),
  account_id: z.string().min(1).optional().nullable(),
  type: z.string().min(1).optional().default('note'),
  actor: z.string().optional().default(''),
  message: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional().default({}),
})

// Public: global audit / timeline (filter: tracker, account, type)
router.get('/', async (c) => {
  const trackerId = c.req.query('tracker')
  const accountId = c.req.query('account')
  const type = c.req.query('type')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10) || 200, 1000)

  const conds = []
  if (trackerId) conds.push(eq(activities.tracker_id, trackerId))
  if (accountId) conds.push(eq(activities.account_id, accountId))
  if (type) conds.push(eq(activities.type, type))

  const rows = conds.length
    ? await db
        .select()
        .from(activities)
        .where(and(...conds))
        .orderBy(desc(activities.created_at))
        .limit(limit)
    : await db.select().from(activities).orderBy(desc(activities.created_at)).limit(limit)
  return c.json(rows)
})

// Auth: append a manual activity entry
router.post('/', authMiddleware, zValidator('json', activitySchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  if (!body.tracker_id && !body.account_id) {
    return c.json({ error: 'tracker_id or account_id required' }, 400)
  }

  let workspaceId: string | null = null
  let resolvedAccountId: string | null = body.account_id ?? null

  if (body.tracker_id) {
    const [tr] = await db.select().from(trackers).where(eq(trackers.id, body.tracker_id))
    if (!tr) return c.json({ error: 'Tracker not found' }, 404)
    if (tr.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    workspaceId = tr.workspace_id
    if (!resolvedAccountId) resolvedAccountId = tr.account_id
    // Keep tracker last_activity_at fresh on manual append.
    await db.update(trackers).set({ last_activity_at: new Date() }).where(eq(trackers.id, tr.id))
  }

  if (body.account_id) {
    const [acc] = await db.select().from(accounts).where(eq(accounts.id, body.account_id))
    if (!acc) return c.json({ error: 'Account not found' }, 404)
    if (acc.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
    if (workspaceId && workspaceId !== acc.workspace_id) {
      return c.json({ error: 'Tracker and account belong to different workspaces' }, 400)
    }
    workspaceId = acc.workspace_id
  }

  if (!workspaceId) {
    const [member] = await db.select().from(team_members).where(eq(team_members.user_id, userId))
    if (!member) return c.json({ error: 'No workspace context' }, 400)
    workspaceId = member.workspace_id
  }

  const [created] = await db
    .insert(activities)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      tracker_id: body.tracker_id ?? null,
      account_id: resolvedAccountId,
      type: body.type ?? 'note',
      actor: body.actor ?? '',
      message: body.message,
      meta: body.meta ?? {},
    })
    .returning()
  return c.json(created, 201)
})

export default router
