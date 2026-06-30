import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  import_jobs,
  workspaces,
  segments,
  products,
  stages,
  journey_templates,
  template_milestones,
  team_members,
  accounts,
  trackers,
  tracker_milestones,
  blockers,
  activities,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function getOrCreateWorkspace(userId: string) {
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .limit(1)
  if (existing.length > 0) return existing[0]
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return created
}

const DAY_MS = 86_400_000

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS)
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * DAY_MS)
}

// ---------------------------------------------------------------------------
// GET / — public — list import jobs (optional workspace filter)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(import_jobs)
        .where(eq(import_jobs.workspace_id, workspaceId))
        .orderBy(desc(import_jobs.created_at))
    : await db.select().from(import_jobs).orderBy(desc(import_jobs.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /accounts — auth — import accounts from CSV rows (JSON array)
// ---------------------------------------------------------------------------
const importRowSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional().default(''),
  plan: z.string().optional().default(''),
  arr_cents: z.number().int().optional(),
  arr: z.number().optional(),
  segment_id: z.string().optional(),
  product_id: z.string().optional(),
  cs_owner_id: z.string().optional(),
  health: z.string().optional(),
  contract_start: z.string().optional(),
  target_go_live: z.string().optional(),
})

const importAccountsSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())).min(1),
})

router.post(
  '/accounts',
  authMiddleware,
  zValidator('json', importAccountsSchema),
  async (c) => {
    const userId = getUserId(c)
    const ws = await getOrCreateWorkspace(userId)
    const { rows } = c.req.valid('json')

    const errors: string[] = []
    let imported = 0

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]
      // Normalize: accept arr (dollars) or arr_cents; coerce numeric strings.
      const normalized: Record<string, unknown> = { ...raw }
      if (typeof normalized.arr_cents === 'string') {
        const n = Number(normalized.arr_cents)
        if (Number.isFinite(n)) normalized.arr_cents = Math.round(n)
      }
      if (normalized.arr_cents === undefined && normalized.arr !== undefined) {
        const a = typeof normalized.arr === 'string' ? Number(normalized.arr) : normalized.arr
        if (typeof a === 'number' && Number.isFinite(a)) {
          normalized.arr_cents = Math.round(a * 100)
        }
      }
      const parsed = importRowSchema.safeParse(normalized)
      if (!parsed.success) {
        errors.push(`Row ${i + 1}: ${parsed.error.issues.map((e) => e.message).join('; ')}`)
        continue
      }
      const row = parsed.data
      const arrCents =
        row.arr_cents !== undefined
          ? row.arr_cents
          : row.arr !== undefined
            ? Math.round(row.arr * 100)
            : 0

      let contractStart: Date | null = null
      if (row.contract_start) {
        const t = Date.parse(row.contract_start)
        if (!Number.isNaN(t)) contractStart = new Date(t)
      }
      let targetGoLive: Date | null = null
      if (row.target_go_live) {
        const t = Date.parse(row.target_go_live)
        if (!Number.isNaN(t)) targetGoLive = new Date(t)
      }

      try {
        await db.insert(accounts).values({
          workspace_id: ws.id,
          user_id: userId,
          name: row.name,
          domain: row.domain ?? '',
          segment_id: row.segment_id ?? null,
          product_id: row.product_id ?? null,
          plan: row.plan ?? '',
          arr_cents: arrCents,
          contract_start: contractStart,
          target_go_live: targetGoLive,
          cs_owner_id: row.cs_owner_id ?? null,
          health: row.health ?? 'on_track',
        })
        imported++
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const [job] = await db
      .insert(import_jobs)
      .values({
        workspace_id: ws.id,
        user_id: userId,
        source: 'csv',
        kind: 'accounts',
        status: errors.length > 0 && imported === 0 ? 'failed' : 'completed',
        rows_total: rows.length,
        rows_imported: imported,
        errors,
      })
      .returning()

    return c.json(job, 201)
  },
)

// ---------------------------------------------------------------------------
// POST /connector — auth — run a connector stub job
// ---------------------------------------------------------------------------
const connectorSchema = z.object({
  source: z.enum(['salesforce', 'hubspot', 'segment', 'snowflake', 'csv']).optional().default('salesforce'),
  kind: z.string().optional().default('accounts'),
})

router.post('/connector', authMiddleware, zValidator('json', connectorSchema), async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const { source, kind } = c.req.valid('json')

  // Connector stub: records a queued/synced job without an external call.
  const [job] = await db
    .insert(import_jobs)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      source,
      kind,
      status: 'completed',
      rows_total: 0,
      rows_imported: 0,
      errors: [
        `Connector '${source}' is a stub in this build; no live sync performed. Configure credentials to enable real ingestion.`,
      ],
    })
    .returning()

  return c.json(job, 201)
})

// ---------------------------------------------------------------------------
// POST /seed-sample — auth — provision a full demo workspace.
// Idempotent guard: if the workspace already has demo accounts, returns the
// existing counts instead of duplicating.
// ---------------------------------------------------------------------------
router.post('/seed-sample', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)

  const existingAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.workspace_id, ws.id))
    .limit(1)
  if (existingAccounts.length > 0) {
    return c.json({
      seeded: false,
      reason: 'Workspace already has data; seeding skipped to avoid duplicates.',
      counts: {},
    })
  }

  const counts: Record<string, number> = {}

  // --- Segments ---
  const segmentDefs = [
    { name: 'Enterprise', description: 'Large strategic accounts', color: '#6366f1' },
    { name: 'Mid-Market', description: 'Growing teams', color: '#0ea5e9' },
    { name: 'SMB', description: 'Self-serve and small teams', color: '#22c55e' },
  ]
  const segs: { id: string; name: string }[] = []
  for (const s of segmentDefs) {
    const [row] = await db
      .insert(segments)
      .values({ workspace_id: ws.id, user_id: userId, ...s })
      .returning()
    segs.push({ id: row.id, name: row.name })
  }
  counts.segments = segs.length

  // --- Products ---
  const productDefs = [
    { name: 'Core Platform', description: 'Primary SaaS product' },
    { name: 'Analytics Add-on', description: 'Reporting and dashboards' },
  ]
  const prods: { id: string; name: string }[] = []
  for (const p of productDefs) {
    const [row] = await db
      .insert(products)
      .values({ workspace_id: ws.id, user_id: userId, ...p })
      .returning()
    prods.push({ id: row.id, name: row.name })
  }
  counts.products = prods.length

  // --- Stages (library) ---
  const stageDefs = [
    { name: 'Kickoff', category: 'kickoff', default_target_days: 3, weight: 1 },
    { name: 'Data Integration', category: 'setup', default_target_days: 7, weight: 2 },
    { name: 'Configuration', category: 'setup', default_target_days: 5, weight: 1.5 },
    { name: 'Pilot / First Value', category: 'adoption', default_target_days: 5, weight: 2 },
    { name: 'Training & Rollout', category: 'adoption', default_target_days: 7, weight: 1.5 },
    { name: 'Go-Live', category: 'go_live', default_target_days: 3, weight: 2 },
  ]
  const stageRows: { id: string; name: string; category: string; target: number; weight: number }[] = []
  for (const s of stageDefs) {
    const [row] = await db
      .insert(stages)
      .values({
        workspace_id: ws.id,
        user_id: userId,
        name: s.name,
        category: s.category,
        default_target_days: s.default_target_days,
        weight: s.weight,
        checklist: [`Complete ${s.name} tasks`, 'Confirm with customer'],
      })
      .returning()
    stageRows.push({
      id: row.id,
      name: row.name,
      category: s.category,
      target: s.default_target_days,
      weight: s.weight,
    })
  }
  counts.stages = stageRows.length

  // --- Team members ---
  const memberDefs = [
    { name: 'Avery Chen', email: 'avery@example.com', target_load: 8 },
    { name: 'Jordan Patel', email: 'jordan@example.com', target_load: 10 },
    { name: 'Sam Rivera', email: 'sam@example.com', target_load: 6 },
  ]
  const members: { id: string; name: string }[] = []
  for (const m of memberDefs) {
    const [row] = await db
      .insert(team_members)
      .values({
        workspace_id: ws.id,
        user_id: userId,
        name: m.name,
        email: m.email,
        role: 'implementation_manager',
        target_load: m.target_load,
        active: true,
      })
      .returning()
    members.push({ id: row.id, name: row.name })
  }
  counts.team_members = members.length

  // --- Journey template + milestones (built from the stage library) ---
  const totalTarget = stageRows.reduce((sum, s) => sum + s.target, 0)
  const [template] = await db
    .insert(journey_templates)
    .values({
      workspace_id: ws.id,
      user_id: userId,
      name: 'Standard Enterprise Onboarding',
      description: 'Default journey from kickoff to go-live',
      segment_id: segs[0].id,
      product_id: prods[0].id,
      version: 1,
      status: 'active',
      total_target_days: totalTarget,
      is_default: true,
    })
    .returning()
  counts.templates = 1

  const templateMilestoneRows: {
    id: string
    name: string
    category: string
    position: number
    target_days: number
    weight: number
    is_first_value: boolean
    is_go_live: boolean
  }[] = []
  for (let i = 0; i < stageRows.length; i++) {
    const s = stageRows[i]
    const isFirstValue = s.name === 'Pilot / First Value'
    const isGoLive = s.category === 'go_live'
    const [row] = await db
      .insert(template_milestones)
      .values({
        template_id: template.id,
        stage_id: s.id,
        name: s.name,
        description: `${s.name} milestone`,
        category: s.category,
        position: i,
        target_days: s.target,
        weight: s.weight,
        is_first_value: isFirstValue,
        is_go_live: isGoLive,
        exit_criteria: `${s.name} signed off by customer`,
        checklist: [`Complete ${s.name}`, 'Confirm exit criteria'],
      })
      .returning()
    templateMilestoneRows.push({
      id: row.id,
      name: row.name,
      category: s.category,
      position: i,
      target_days: s.target,
      weight: s.weight,
      is_first_value: isFirstValue,
      is_go_live: isGoLive,
    })
  }
  counts.template_milestones = templateMilestoneRows.length

  // Default workspace template/segment now that we have ids
  await db
    .update(workspaces)
    .set({
      default_segment_id: segs[0].id,
      default_template_id: template.id,
      updated_at: new Date(),
    })
    .where(eq(workspaces.id, ws.id))

  // --- Accounts + trackers + tracker milestones + activities ---
  // Each account starts a tracker at a different progress point so the demo
  // shows on-track, stalled, completed, and at-risk states.
  const accountDefs = [
    {
      name: 'Northwind Corp',
      domain: 'northwind.com',
      segment: 0,
      plan: 'Enterprise',
      arr_cents: 12_000_000,
      manager: 0,
      health: 'on_track',
      startedDaysAgo: 8,
      completedMilestones: 2,
      addBlocker: false,
      status: 'in_progress',
    },
    {
      name: 'Globex LLC',
      domain: 'globex.com',
      segment: 0,
      plan: 'Enterprise',
      arr_cents: 24_000_000,
      manager: 1,
      health: 'at_risk',
      startedDaysAgo: 32,
      completedMilestones: 2,
      addBlocker: true,
      status: 'in_progress',
    },
    {
      name: 'Initech',
      domain: 'initech.com',
      segment: 1,
      plan: 'Mid-Market',
      arr_cents: 6_000_000,
      manager: 1,
      health: 'on_track',
      startedDaysAgo: 14,
      completedMilestones: 4,
      addBlocker: false,
      status: 'in_progress',
    },
    {
      name: 'Hooli',
      domain: 'hooli.com',
      segment: 1,
      plan: 'Mid-Market',
      arr_cents: 9_000_000,
      manager: 2,
      health: 'on_track',
      startedDaysAgo: 45,
      completedMilestones: 6,
      addBlocker: false,
      status: 'completed',
    },
    {
      name: 'Soylent Co',
      domain: 'soylent.com',
      segment: 2,
      plan: 'SMB',
      arr_cents: 1_800_000,
      manager: 2,
      health: 'at_risk',
      startedDaysAgo: 21,
      completedMilestones: 1,
      addBlocker: true,
      status: 'in_progress',
    },
  ]

  let accountCount = 0
  let trackerCount = 0
  let trackerMilestoneCount = 0
  let blockerCount = 0
  let activityCount = 0

  for (const def of accountDefs) {
    const [account] = await db
      .insert(accounts)
      .values({
        workspace_id: ws.id,
        user_id: userId,
        name: def.name,
        domain: def.domain,
        segment_id: segs[def.segment].id,
        product_id: prods[0].id,
        plan: def.plan,
        arr_cents: def.arr_cents,
        contract_start: daysAgo(def.startedDaysAgo + 5),
        target_go_live: daysFromNow(30 - def.startedDaysAgo),
        cs_owner_id: members[def.manager].id,
        health: def.health,
      })
      .returning()
    accountCount++

    const startedAt = daysAgo(def.startedDaysAgo)
    const total = templateMilestoneRows.length
    const completed = Math.min(def.completedMilestones, total)
    const progressPct = Math.round((completed / total) * 100)

    // Determine current milestone (first not-completed) and value timestamps.
    const currentTmpl =
      completed < total ? templateMilestoneRows[completed] : templateMilestoneRows[total - 1]

    let firstValueAt: Date | null = null
    let goLiveAt: Date | null = null

    const [tracker] = await db
      .insert(trackers)
      .values({
        workspace_id: ws.id,
        user_id: userId,
        account_id: account.id,
        template_id: template.id,
        template_version: 1,
        manager_id: members[def.manager].id,
        status: def.status,
        started_at: startedAt,
        progress_pct: progressPct,
        risk_score: def.health === 'at_risk' ? 0.7 : 0.2,
        last_activity_at: daysAgo(def.health === 'at_risk' ? def.startedDaysAgo - 1 : 0),
      })
      .returning()
    trackerCount++

    // Build snapshotted tracker milestones, marking the first N completed.
    let cumulativeDays = 0
    let createdFirstValueMilestoneId: string | null = null
    let createdGoLiveMilestoneId: string | null = null
    const trackerMilestoneByPos: { id: string; tmpl: typeof templateMilestoneRows[number] }[] = []

    for (let i = 0; i < total; i++) {
      const tm = templateMilestoneRows[i]
      const isDone = i < completed
      const isCurrent = i === completed && completed < total
      cumulativeDays += tm.target_days
      const mStartedAt = isDone || isCurrent ? daysAgo(def.startedDaysAgo - (cumulativeDays - tm.target_days)) : null
      const mCompletedAt = isDone ? daysAgo(def.startedDaysAgo - cumulativeDays) : null

      if (isDone && tm.is_first_value && mCompletedAt) firstValueAt = mCompletedAt
      if (isDone && tm.is_go_live && mCompletedAt) goLiveAt = mCompletedAt

      const [row] = await db
        .insert(tracker_milestones)
        .values({
          tracker_id: tracker.id,
          template_milestone_id: tm.id,
          name: tm.name,
          category: tm.category,
          position: tm.position,
          target_days: tm.target_days,
          weight: tm.weight,
          is_first_value: tm.is_first_value,
          is_go_live: tm.is_go_live,
          status: isDone ? 'completed' : isCurrent ? 'in_progress' : 'not_started',
          started_at: mStartedAt,
          completed_at: mCompletedAt,
        })
        .returning()
      trackerMilestoneCount++
      trackerMilestoneByPos.push({ id: row.id, tmpl: tm })
      if (tm.is_first_value) createdFirstValueMilestoneId = row.id
      if (tm.is_go_live) createdGoLiveMilestoneId = row.id
    }

    // Set current milestone + value timestamps on tracker.
    const currentTrackerMilestone =
      completed < total
        ? trackerMilestoneByPos[completed]
        : trackerMilestoneByPos[total - 1]
    await db
      .update(trackers)
      .set({
        current_milestone_id: currentTrackerMilestone?.id ?? null,
        first_value_at: firstValueAt,
        go_live_at: def.status === 'completed' ? goLiveAt ?? daysAgo(1) : goLiveAt,
        projected_go_live: def.status === 'completed' ? null : daysFromNow(Math.max(1, cumulativeDays - def.startedDaysAgo)),
        updated_at: new Date(),
      })
      .where(eq(trackers.id, tracker.id))

    void currentTmpl
    void createdFirstValueMilestoneId
    void createdGoLiveMilestoneId

    // Activity history: started + each completed milestone.
    await db.insert(activities).values({
      workspace_id: ws.id,
      user_id: userId,
      tracker_id: tracker.id,
      account_id: account.id,
      type: 'tracker_started',
      actor: members[def.manager].name,
      message: `Started onboarding for ${account.name}`,
      meta: {},
      created_at: startedAt,
    })
    activityCount++
    for (let i = 0; i < completed; i++) {
      await db.insert(activities).values({
        workspace_id: ws.id,
        user_id: userId,
        tracker_id: tracker.id,
        account_id: account.id,
        type: 'milestone_completed',
        actor: members[def.manager].name,
        message: `Completed milestone "${templateMilestoneRows[i].name}"`,
        meta: { milestone: templateMilestoneRows[i].name },
        created_at: daysAgo(def.startedDaysAgo - (i + 1) * 4),
      })
      activityCount++
    }

    // Blocker for at-risk accounts.
    if (def.addBlocker) {
      await db.insert(blockers).values({
        workspace_id: ws.id,
        user_id: userId,
        tracker_id: tracker.id,
        tracker_milestone_id: currentTrackerMilestone?.id ?? null,
        category: 'customer_side',
        title: 'Awaiting customer data export',
        description: 'Customer has not yet provided the data export needed to proceed.',
        severity: 'high',
        owner: 'customer',
        status: 'open',
        opened_at: daysAgo(Math.max(1, Math.floor(def.startedDaysAgo / 2))),
      })
      blockerCount++
      await db.insert(activities).values({
        workspace_id: ws.id,
        user_id: userId,
        tracker_id: tracker.id,
        account_id: account.id,
        type: 'blocker_opened',
        actor: members[def.manager].name,
        message: `Opened blocker: Awaiting customer data export`,
        meta: { severity: 'high' },
        created_at: daysAgo(Math.max(1, Math.floor(def.startedDaysAgo / 2))),
      })
      activityCount++
    }
  }

  counts.accounts = accountCount
  counts.trackers = trackerCount
  counts.tracker_milestones = trackerMilestoneCount
  counts.blockers = blockerCount
  counts.activities = activityCount

  // Record the seed as an import job.
  await db.insert(import_jobs).values({
    workspace_id: ws.id,
    user_id: userId,
    source: 'sample',
    kind: 'seed',
    status: 'completed',
    rows_total: accountCount,
    rows_imported: accountCount,
    errors: [],
  })

  return c.json({ seeded: true, workspace_id: ws.id, counts })
})

export default router
