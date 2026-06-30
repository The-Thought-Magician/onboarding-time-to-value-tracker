import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Workspaces (per-user tenant)
// ---------------------------------------------------------------------------
export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  default_segment_id: text('default_segment_id'),
  default_template_id: text('default_template_id'),
  business_days_only: boolean('business_days_only').default(true).notNull(),
  default_stall_days: integer('default_stall_days').default(7).notNull(),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------
export const segments = pgTable('segments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  color: text('color').default('#6366f1'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export const products = pgTable('products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Stage library (reusable building blocks)
// ---------------------------------------------------------------------------
export const stages = pgTable('stages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull().default('setup'),
  default_target_days: integer('default_target_days').notNull().default(5),
  owner_role: text('owner_role').default('implementation_manager'),
  weight: real('weight').default(1),
  checklist: jsonb('checklist').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Journey templates (versioned)
// ---------------------------------------------------------------------------
export const journey_templates = pgTable('journey_templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  segment_id: text('segment_id').references(() => segments.id),
  product_id: text('product_id').references(() => products.id),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('active'),
  total_target_days: integer('total_target_days').default(0),
  is_default: boolean('is_default').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Template milestones (ordered within a template)
// ---------------------------------------------------------------------------
export const template_milestones = pgTable('template_milestones', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  template_id: text('template_id').notNull().references(() => journey_templates.id),
  stage_id: text('stage_id').references(() => stages.id),
  name: text('name').notNull(),
  description: text('description').default(''),
  category: text('category').notNull().default('setup'),
  position: integer('position').notNull().default(0),
  target_days: integer('target_days').notNull().default(5),
  owner_role: text('owner_role').default('implementation_manager'),
  weight: real('weight').default(1),
  is_first_value: boolean('is_first_value').default(false).notNull(),
  is_go_live: boolean('is_go_live').default(false).notNull(),
  exit_criteria: text('exit_criteria').default(''),
  checklist: jsonb('checklist').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Team members (implementation managers directory)
// ---------------------------------------------------------------------------
export const team_members = pgTable('team_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  email: text('email').default(''),
  role: text('role').notNull().default('implementation_manager'),
  target_load: integer('target_load').default(10),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Accounts (customer records)
// ---------------------------------------------------------------------------
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  domain: text('domain').default(''),
  segment_id: text('segment_id').references(() => segments.id),
  product_id: text('product_id').references(() => products.id),
  plan: text('plan').default(''),
  arr_cents: integer('arr_cents').default(0).notNull(),
  contract_start: timestamp('contract_start'),
  target_go_live: timestamp('target_go_live'),
  cs_owner_id: text('cs_owner_id').references(() => team_members.id),
  health: text('health').notNull().default('on_track'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Trackers (live implementation instance per account)
// ---------------------------------------------------------------------------
export const trackers = pgTable('trackers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  account_id: text('account_id').notNull().references(() => accounts.id),
  template_id: text('template_id').references(() => journey_templates.id),
  template_version: integer('template_version').default(1),
  manager_id: text('manager_id').references(() => team_members.id),
  status: text('status').notNull().default('in_progress'),
  current_milestone_id: text('current_milestone_id'),
  started_at: timestamp('started_at').defaultNow(),
  first_value_at: timestamp('first_value_at'),
  go_live_at: timestamp('go_live_at'),
  projected_go_live: timestamp('projected_go_live'),
  progress_pct: real('progress_pct').default(0),
  risk_score: real('risk_score').default(0),
  last_activity_at: timestamp('last_activity_at').defaultNow(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [unique().on(t.account_id)])

// ---------------------------------------------------------------------------
// Tracker milestones (snapshotted milestone state per tracker)
// ---------------------------------------------------------------------------
export const tracker_milestones = pgTable('tracker_milestones', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tracker_id: text('tracker_id').notNull().references(() => trackers.id),
  template_milestone_id: text('template_milestone_id'),
  name: text('name').notNull(),
  category: text('category').notNull().default('setup'),
  position: integer('position').notNull().default(0),
  target_days: integer('target_days').notNull().default(5),
  weight: real('weight').default(1),
  is_first_value: boolean('is_first_value').default(false).notNull(),
  is_go_live: boolean('is_go_live').default(false).notNull(),
  status: text('status').notNull().default('not_started'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Blocker categories (taxonomy)
// ---------------------------------------------------------------------------
export const blocker_categories = pgTable('blocker_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Blockers (blocker log)
// ---------------------------------------------------------------------------
export const blockers = pgTable('blockers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').notNull().references(() => trackers.id),
  tracker_milestone_id: text('tracker_milestone_id').references(() => tracker_milestones.id),
  category_id: text('category_id').references(() => blocker_categories.id),
  category: text('category').notNull().default('customer_side'),
  title: text('title').notNull(),
  description: text('description').default(''),
  severity: text('severity').notNull().default('medium'),
  owner: text('owner').default(''),
  status: text('status').notNull().default('open'),
  opened_at: timestamp('opened_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').notNull().references(() => trackers.id),
  tracker_milestone_id: text('tracker_milestone_id').references(() => tracker_milestones.id),
  author: text('author').default(''),
  body: text('body').notNull(),
  customer_visible: boolean('customer_visible').default(false).notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Tasks (action items)
// ---------------------------------------------------------------------------
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').references(() => trackers.id),
  tracker_milestone_id: text('tracker_milestone_id').references(() => tracker_milestones.id),
  title: text('title').notNull(),
  description: text('description').default(''),
  assignee_id: text('assignee_id').references(() => team_members.id),
  due_date: timestamp('due_date'),
  status: text('status').notNull().default('open'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Activities (timeline / audit log)
// ---------------------------------------------------------------------------
export const activities = pgTable('activities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').references(() => trackers.id),
  account_id: text('account_id').references(() => accounts.id),
  type: text('type').notNull(),
  actor: text('actor').default(''),
  message: text('message').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// SLA policies
// ---------------------------------------------------------------------------
export const sla_policies = pgTable('sla_policies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  segment_id: text('segment_id').references(() => segments.id),
  template_id: text('template_id').references(() => journey_templates.id),
  target_first_value_days: integer('target_first_value_days').notNull().default(14),
  target_go_live_days: integer('target_go_live_days').notNull().default(30),
  grace_days: integer('grace_days').default(3),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Risk items (at-risk queue with triage)
// ---------------------------------------------------------------------------
export const risk_items = pgTable('risk_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').notNull().references(() => trackers.id),
  account_id: text('account_id').references(() => accounts.id),
  severity: text('severity').notNull().default('at_risk'),
  score: real('score').default(0),
  reason: text('reason').default(''),
  triage_status: text('triage_status').notNull().default('new'),
  assignee_id: text('assignee_id').references(() => team_members.id),
  snoozed_until: timestamp('snoozed_until'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').default(''),
  link: text('link').default(''),
  read: boolean('read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------
export const alert_rules = pgTable('alert_rules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  metric: text('metric').notNull().default('days_overdue'),
  comparator: text('comparator').notNull().default('gte'),
  threshold: real('threshold').notNull().default(7),
  severity: text('severity').notNull().default('at_risk'),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Saved views / cohorts
// ---------------------------------------------------------------------------
export const saved_views = pgTable('saved_views', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('tracker'),
  filters: jsonb('filters').$type<Record<string, unknown>>().default({}),
  pinned: boolean('pinned').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------
export const report_definitions = pgTable('report_definitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  metrics: jsonb('metrics').$type<string[]>().default([]),
  filters: jsonb('filters').$type<Record<string, unknown>>().default({}),
  schedule: text('schedule').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Report snapshots
// ---------------------------------------------------------------------------
export const report_snapshots = pgTable('report_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  report_definition_id: text('report_definition_id').references(() => report_definitions.id),
  title: text('title').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Shared plans (public token-shared onboarding plans)
// ---------------------------------------------------------------------------
export const shared_plans = pgTable('shared_plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  tracker_id: text('tracker_id').notNull().references(() => trackers.id),
  token: text('token').notNull().unique(),
  title: text('title').default(''),
  active: boolean('active').default(true).notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Import jobs / connectors
// ---------------------------------------------------------------------------
export const import_jobs = pgTable('import_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  source: text('source').notNull().default('csv'),
  kind: text('kind').notNull().default('accounts'),
  status: text('status').notNull().default('completed'),
  rows_total: integer('rows_total').default(0),
  rows_imported: integer('rows_imported').default(0),
  errors: jsonb('errors').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing: plans
// ---------------------------------------------------------------------------
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing: subscriptions
// ---------------------------------------------------------------------------
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
