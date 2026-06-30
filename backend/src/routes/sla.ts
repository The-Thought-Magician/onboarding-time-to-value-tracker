import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { sla_policies, trackers, accounts, team_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const policySchema = z.object({
  name: z.string().min(1),
  segment_id: z.string().min(1).optional().nullable(),
  template_id: z.string().min(1).optional().nullable(),
  target_first_value_days: z.number().int().positive().optional().default(14),
  target_go_live_days: z.number().int().positive().optional().default(30),
  grace_days: z.number().int().min(0).optional().default(3),
  active: z.boolean().optional().default(true),
})

const policyUpdateSchema = policySchema.partial()

const DAY_MS = 86_400_000

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return (b.getTime() - a.getTime()) / DAY_MS
}

// Public: list SLA policies (optionally by workspace)
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace')
  const rows = workspaceId
    ? await db
        .select()
        .from(sla_policies)
        .where(eq(sla_policies.workspace_id, workspaceId))
        .orderBy(desc(sla_policies.created_at))
    : await db.select().from(sla_policies).orderBy(desc(sla_policies.created_at))
  return c.json(rows)
})

// Public: SLA attainment rate + breach list
router.get('/attainment', async (c) => {
  const workspaceId = c.req.query('workspace')

  const policies = workspaceId
    ? await db.select().from(sla_policies).where(and(eq(sla_policies.workspace_id, workspaceId), eq(sla_policies.active, true)))
    : await db.select().from(sla_policies).where(eq(sla_policies.active, true))

  const trackerRows = workspaceId
    ? await db.select().from(trackers).where(eq(trackers.workspace_id, workspaceId))
    : await db.select().from(trackers)

  const accountRows = workspaceId
    ? await db.select().from(accounts).where(eq(accounts.workspace_id, workspaceId))
    : await db.select().from(accounts)
  const accById = new Map(accountRows.map((a) => [a.id, a]))

  // Choose the SLA policy applicable to a tracker: prefer a policy matching both
  // template and the account's segment, then template-only, then segment-only,
  // then a workspace default (no segment/template). First match wins per priority.
  function policyFor(tr: (typeof trackerRows)[number]) {
    const acc = accById.get(tr.account_id)
    const segId = acc?.segment_id ?? null
    const scoped = policies.filter((p) => p.workspace_id === tr.workspace_id)
    const both = scoped.find((p) => p.template_id && p.template_id === tr.template_id && p.segment_id && p.segment_id === segId)
    if (both) return both
    const byTemplate = scoped.find((p) => p.template_id && p.template_id === tr.template_id && !p.segment_id)
    if (byTemplate) return byTemplate
    const bySegment = scoped.find((p) => p.segment_id && p.segment_id === segId && !p.template_id)
    if (bySegment) return bySegment
    const fallback = scoped.find((p) => !p.segment_id && !p.template_id)
    return fallback ?? null
  }

  const breaches: Array<{
    tracker_id: string
    account_id: string
    account_name: string
    policy_id: string
    policy_name: string
    metric: 'first_value' | 'go_live'
    actual_days: number | null
    target_days: number
    grace_days: number
    over_by_days: number
    status: 'breached' | 'projected_breach'
  }> = []

  let evaluated = 0
  let met = 0
  const now = new Date()

  for (const tr of trackerRows) {
    const policy = policyFor(tr)
    if (!policy) continue
    const acc = accById.get(tr.account_id)
    const accName = acc?.name ?? 'Unknown account'
    const grace = policy.grace_days ?? 0
    const started = tr.started_at ? new Date(tr.started_at as unknown as string) : null

    // ----- First-value metric -----
    {
      const target = policy.target_first_value_days
      const allowed = target + grace
      let actual = daysBetween(started, tr.first_value_at ? new Date(tr.first_value_at as unknown as string) : null)
      let breached = false
      let projected = false
      if (actual !== null) {
        // First value achieved: measured outcome
        evaluated++
        if (actual <= allowed) met++
        else breached = true
      } else if (started) {
        // Not yet achieved: project breach against elapsed time
        const elapsed = daysBetween(started, now)!
        if (elapsed > allowed && tr.status !== 'completed' && tr.status !== 'cancelled') {
          evaluated++
          breached = true
          projected = true
          actual = elapsed
        }
      }
      if (breached) {
        breaches.push({
          tracker_id: tr.id,
          account_id: tr.account_id,
          account_name: accName,
          policy_id: policy.id,
          policy_name: policy.name,
          metric: 'first_value',
          actual_days: actual === null ? null : Math.round(actual * 10) / 10,
          target_days: target,
          grace_days: grace,
          over_by_days: Math.round(((actual ?? allowed) - allowed) * 10) / 10,
          status: projected ? 'projected_breach' : 'breached',
        })
      }
    }

    // ----- Go-live metric -----
    {
      const target = policy.target_go_live_days
      const allowed = target + grace
      let actual = daysBetween(started, tr.go_live_at ? new Date(tr.go_live_at as unknown as string) : null)
      let breached = false
      let projected = false
      if (actual !== null) {
        evaluated++
        if (actual <= allowed) met++
        else breached = true
      } else if (started) {
        const elapsed = daysBetween(started, now)!
        if (elapsed > allowed && tr.status !== 'completed' && tr.status !== 'cancelled') {
          evaluated++
          breached = true
          projected = true
          actual = elapsed
        }
      }
      if (breached) {
        breaches.push({
          tracker_id: tr.id,
          account_id: tr.account_id,
          account_name: accName,
          policy_id: policy.id,
          policy_name: policy.name,
          metric: 'go_live',
          actual_days: actual === null ? null : Math.round(actual * 10) / 10,
          target_days: target,
          grace_days: grace,
          over_by_days: Math.round(((actual ?? allowed) - allowed) * 10) / 10,
          status: projected ? 'projected_breach' : 'breached',
        })
      }
    }
  }

  const attainmentPct = evaluated === 0 ? 100 : Math.round((met / evaluated) * 1000) / 10
  breaches.sort((a, b) => b.over_by_days - a.over_by_days)

  return c.json({ attainmentPct, evaluated, met, breached: breaches.length, breaches })
})

// Auth: create policy
router.post('/', authMiddleware, zValidator('json', policySchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [member] = await db.select().from(team_members).where(eq(team_members.user_id, userId))
  const workspaceId = c.req.query('workspace') ?? member?.workspace_id
  if (!workspaceId) return c.json({ error: 'No workspace context' }, 400)

  const [created] = await db
    .insert(sla_policies)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: body.name,
      segment_id: body.segment_id ?? null,
      template_id: body.template_id ?? null,
      target_first_value_days: body.target_first_value_days ?? 14,
      target_go_live_days: body.target_go_live_days ?? 30,
      grace_days: body.grace_days ?? 3,
      active: body.active ?? true,
    })
    .returning()
  return c.json(created, 201)
})

// Auth: update policy
router.put('/:id', authMiddleware, zValidator('json', policyUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(sla_policies).where(eq(sla_policies.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.segment_id !== undefined) patch.segment_id = body.segment_id
  if (body.template_id !== undefined) patch.template_id = body.template_id
  if (body.target_first_value_days !== undefined) patch.target_first_value_days = body.target_first_value_days
  if (body.target_go_live_days !== undefined) patch.target_go_live_days = body.target_go_live_days
  if (body.grace_days !== undefined) patch.grace_days = body.grace_days
  if (body.active !== undefined) patch.active = body.active

  const [updated] = await db.update(sla_policies).set(patch).where(eq(sla_policies.id, id)).returning()
  return c.json(updated)
})

// Auth: delete policy
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(sla_policies).where(eq(sla_policies.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(sla_policies).where(eq(sla_policies.id, id))
  return c.json({ success: true })
})

export default router
