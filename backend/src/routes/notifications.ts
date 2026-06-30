import { Hono } from 'hono'
import { db } from '../db/index.js'
import { notifications, trackers, accounts, workspaces } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

// Resolve the caller's workspace (get-or-create) so generated notifications and
// listing are always scoped to a real workspace owned by the caller.
async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.user_id, userId))
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

// GET / — auth — caller's notifications
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
  return c.json(rows)
})

// POST /:id/read — auth — mark a single notification read
router.post('/:id/read', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning()
  return c.json(updated)
})

// POST /read-all — auth — mark all caller notifications read
router.post('/read-all', authMiddleware, async (c) => {
  const userId = getUserId(c)
  await db.update(notifications).set({ read: true }).where(eq(notifications.user_id, userId))
  return c.json({ success: true })
})

// POST /generate — auth — generate notifications from current at-risk/overdue state.
// We scan the caller's trackers and create one notification per tracker that is
// overdue (past target go-live with no go_live_at) or stalled (no activity for
// >= workspace default_stall_days). Idempotent within a run: we skip trackers
// that already have an unread notification of the same type+link.
router.post('/generate', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const stallDays = ws.default_stall_days ?? 7
  const now = Date.now()

  const wsTrackers = await db
    .select()
    .from(trackers)
    .where(eq(trackers.workspace_id, ws.id))
  const wsAccounts = await db.select().from(accounts).where(eq(accounts.workspace_id, ws.id))
  const accountById = new Map(wsAccounts.map((a) => [a.id, a]))

  // existing unread notifications to dedupe against
  const existing = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)))
  const existingKeys = new Set(existing.map((n) => `${n.type}:${n.link}`))

  let created = 0
  for (const t of wsTrackers) {
    const isDone = t.status === 'completed' || !!t.go_live_at
    if (isDone) continue
    const acct = t.account_id ? accountById.get(t.account_id) : undefined
    const acctName = acct?.name ?? 'Account'
    const link = `/dashboard/trackers/${t.id}`

    // Overdue: target_go_live in the past and not gone live
    if (acct?.target_go_live && new Date(acct.target_go_live).getTime() < now) {
      const key = `overdue:${link}`
      if (!existingKeys.has(key)) {
        const overdueDays = Math.floor(
          (now - new Date(acct.target_go_live).getTime()) / DAY_MS,
        )
        await db.insert(notifications).values({
          workspace_id: ws.id,
          user_id: userId,
          type: 'overdue',
          title: `${acctName} is overdue`,
          body: `Target go-live passed ${overdueDays} day(s) ago and the implementation is not live yet.`,
          link,
        })
        existingKeys.add(key)
        created += 1
      }
      continue
    }

    // Stalled: no activity for >= stallDays
    const last = t.last_activity_at ? new Date(t.last_activity_at).getTime() : null
    if (last !== null && now - last >= stallDays * DAY_MS) {
      const key = `stalled:${link}`
      if (!existingKeys.has(key)) {
        const idleDays = Math.floor((now - last) / DAY_MS)
        await db.insert(notifications).values({
          workspace_id: ws.id,
          user_id: userId,
          type: 'stalled',
          title: `${acctName} has stalled`,
          body: `No activity for ${idleDays} day(s) (threshold ${stallDays}).`,
          link,
        })
        existingKeys.add(key)
        created += 1
      }
    }
  }

  return c.json({ created })
})

export default router
