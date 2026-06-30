import { db } from './index.js'
import { sql } from 'drizzle-orm'

// Idempotent, self-provisioning schema for a fresh Neon database.
// DDL column names/types EXACTLY match src/db/schema.ts.
const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    default_segment_id text,
    default_template_id text,
    business_days_only boolean NOT NULL DEFAULT true,
    default_stall_days integer NOT NULL DEFAULT 7,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS segments (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT '',
    color text DEFAULT '#6366f1',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS stages (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'setup',
    default_target_days integer NOT NULL DEFAULT 5,
    owner_role text DEFAULT 'implementation_manager',
    weight real DEFAULT 1,
    checklist jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS journey_templates (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT '',
    segment_id text REFERENCES segments(id),
    product_id text REFERENCES products(id),
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'active',
    total_target_days integer DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS template_milestones (
    id text PRIMARY KEY,
    template_id text NOT NULL REFERENCES journey_templates(id),
    stage_id text REFERENCES stages(id),
    name text NOT NULL,
    description text DEFAULT '',
    category text NOT NULL DEFAULT 'setup',
    position integer NOT NULL DEFAULT 0,
    target_days integer NOT NULL DEFAULT 5,
    owner_role text DEFAULT 'implementation_manager',
    weight real DEFAULT 1,
    is_first_value boolean NOT NULL DEFAULT false,
    is_go_live boolean NOT NULL DEFAULT false,
    exit_criteria text DEFAULT '',
    checklist jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS team_members (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    email text DEFAULT '',
    role text NOT NULL DEFAULT 'implementation_manager',
    target_load integer DEFAULT 10,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    domain text DEFAULT '',
    segment_id text REFERENCES segments(id),
    product_id text REFERENCES products(id),
    plan text DEFAULT '',
    arr_cents integer NOT NULL DEFAULT 0,
    contract_start timestamptz,
    target_go_live timestamptz,
    cs_owner_id text REFERENCES team_members(id),
    health text NOT NULL DEFAULT 'on_track',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS trackers (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    account_id text NOT NULL REFERENCES accounts(id),
    template_id text REFERENCES journey_templates(id),
    template_version integer DEFAULT 1,
    manager_id text REFERENCES team_members(id),
    status text NOT NULL DEFAULT 'in_progress',
    current_milestone_id text,
    started_at timestamptz DEFAULT now(),
    first_value_at timestamptz,
    go_live_at timestamptz,
    projected_go_live timestamptz,
    progress_pct real DEFAULT 0,
    risk_score real DEFAULT 0,
    last_activity_at timestamptz DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id)
  )`,

  `CREATE TABLE IF NOT EXISTS tracker_milestones (
    id text PRIMARY KEY,
    tracker_id text NOT NULL REFERENCES trackers(id),
    template_milestone_id text,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'setup',
    position integer NOT NULL DEFAULT 0,
    target_days integer NOT NULL DEFAULT 5,
    weight real DEFAULT 1,
    is_first_value boolean NOT NULL DEFAULT false,
    is_go_live boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'not_started',
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS blocker_categories (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS blockers (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text NOT NULL REFERENCES trackers(id),
    tracker_milestone_id text REFERENCES tracker_milestones(id),
    category_id text REFERENCES blocker_categories(id),
    category text NOT NULL DEFAULT 'customer_side',
    title text NOT NULL,
    description text DEFAULT '',
    severity text NOT NULL DEFAULT 'medium',
    owner text DEFAULT '',
    status text NOT NULL DEFAULT 'open',
    opened_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notes (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text NOT NULL REFERENCES trackers(id),
    tracker_milestone_id text REFERENCES tracker_milestones(id),
    author text DEFAULT '',
    body text NOT NULL,
    customer_visible boolean NOT NULL DEFAULT false,
    pinned boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text REFERENCES trackers(id),
    tracker_milestone_id text REFERENCES tracker_milestones(id),
    title text NOT NULL,
    description text DEFAULT '',
    assignee_id text REFERENCES team_members(id),
    due_date timestamptz,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS activities (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text REFERENCES trackers(id),
    account_id text REFERENCES accounts(id),
    type text NOT NULL,
    actor text DEFAULT '',
    message text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS sla_policies (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    segment_id text REFERENCES segments(id),
    template_id text REFERENCES journey_templates(id),
    target_first_value_days integer NOT NULL DEFAULT 14,
    target_go_live_days integer NOT NULL DEFAULT 30,
    grace_days integer DEFAULT 3,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS risk_items (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text NOT NULL REFERENCES trackers(id),
    account_id text REFERENCES accounts(id),
    severity text NOT NULL DEFAULT 'at_risk',
    score real DEFAULT 0,
    reason text DEFAULT '',
    triage_status text NOT NULL DEFAULT 'new',
    assignee_id text REFERENCES team_members(id),
    snoozed_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text DEFAULT '',
    link text DEFAULT '',
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS alert_rules (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    metric text NOT NULL DEFAULT 'days_overdue',
    comparator text NOT NULL DEFAULT 'gte',
    threshold real NOT NULL DEFAULT 7,
    severity text NOT NULL DEFAULT 'at_risk',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS saved_views (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'tracker',
    filters jsonb DEFAULT '{}'::jsonb,
    pinned boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS report_definitions (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    metrics jsonb DEFAULT '[]'::jsonb,
    filters jsonb DEFAULT '{}'::jsonb,
    schedule text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS report_snapshots (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    report_definition_id text REFERENCES report_definitions(id),
    title text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS shared_plans (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    tracker_id text NOT NULL REFERENCES trackers(id),
    token text NOT NULL UNIQUE,
    title text DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    snapshot jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS import_jobs (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    source text NOT NULL DEFAULT 'csv',
    kind text NOT NULL DEFAULT 'accounts',
    status text NOT NULL DEFAULT 'completed',
    rows_total integer DEFAULT 0,
    rows_imported integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_segments_workspace ON segments(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stages_workspace ON stages(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_journey_templates_workspace ON journey_templates(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_template_milestones_template ON template_milestones(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_workspace ON team_members(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_workspace ON accounts(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_segment ON accounts(segment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trackers_workspace ON trackers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trackers_account ON trackers(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trackers_manager ON trackers(manager_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tracker_milestones_tracker ON tracker_milestones(tracker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blockers_workspace ON blockers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blockers_tracker ON blockers(tracker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_tracker ON notes(tracker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_workspace ON activities(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_tracker ON activities(tracker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sla_policies_workspace ON sla_policies(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_items_workspace ON risk_items(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_risk_items_tracker ON risk_items(tracker_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alert_rules_workspace ON alert_rules(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_views_workspace ON saved_views(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_definitions_workspace ON report_definitions(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_snapshots_workspace ON report_snapshots(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shared_plans_token ON shared_plans(token)`,
  `CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace ON import_jobs(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete: tables + indexes provisioned')
}
