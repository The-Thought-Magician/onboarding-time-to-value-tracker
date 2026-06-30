# Build Plan — Onboarding Time-to-Value Tracker (AUTHORITATIVE BUILD CONTRACT)

This is the single source of truth. Filenames, mount paths, api method names, and page files declared here are BINDING. Every api method is implemented by exactly one route endpoint and consumed by at least one page.

Stack: Hono 4.12.x backend (`/api/v1` child router, `export default router` per file, `getUserId(c)` everywhere, `X-User-Id` trust, zod validation, public reads / auth-gated writes + ownership checks). Next.js 16 + `@neondatabase/auth@0.4.2-beta`, `proxy.ts` only, `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Billing is Stripe-optional (503), all features free.

---

## (a) Tables (columns)

- **workspaces**: id, user_id, name, default_segment_id, default_template_id, business_days_only, default_stall_days, settings(jsonb), created_at, updated_at
- **segments**: id, workspace_id(FK), user_id, name, description, color, created_at
- **products**: id, workspace_id(FK), user_id, name, description, created_at
- **stages**: id, workspace_id(FK), user_id, name, category, default_target_days, owner_role, weight, checklist(jsonb), created_at
- **journey_templates**: id, workspace_id(FK), user_id, name, description, segment_id(FK), product_id(FK), version, status, total_target_days, is_default, created_at, updated_at
- **template_milestones**: id, template_id(FK), stage_id(FK), name, description, category, position, target_days, owner_role, weight, is_first_value, is_go_live, exit_criteria, checklist(jsonb), created_at
- **team_members**: id, workspace_id(FK), user_id, name, email, role, target_load, active, created_at
- **accounts**: id, workspace_id(FK), user_id, name, domain, segment_id(FK), product_id(FK), plan, arr_cents, contract_start, target_go_live, cs_owner_id(FK), health, created_at, updated_at
- **trackers**: id, workspace_id(FK), user_id, account_id(FK, UNIQUE), template_id(FK), template_version, manager_id(FK), status, current_milestone_id, started_at, first_value_at, go_live_at, projected_go_live, progress_pct, risk_score, last_activity_at, created_at, updated_at
- **tracker_milestones**: id, tracker_id(FK), template_milestone_id, name, category, position, target_days, weight, is_first_value, is_go_live, status, started_at, completed_at, created_at
- **blocker_categories**: id, workspace_id(FK), user_id, name, description, created_at
- **blockers**: id, workspace_id(FK), user_id, tracker_id(FK), tracker_milestone_id(FK), category_id(FK), category, title, description, severity, owner, status, opened_at, resolved_at, created_at
- **notes**: id, workspace_id(FK), user_id, tracker_id(FK), tracker_milestone_id(FK), author, body, customer_visible, pinned, created_at
- **tasks**: id, workspace_id(FK), user_id, tracker_id(FK), tracker_milestone_id(FK), title, description, assignee_id(FK), due_date, status, created_at, updated_at
- **activities**: id, workspace_id(FK), user_id, tracker_id(FK), account_id(FK), type, actor, message, meta(jsonb), created_at
- **sla_policies**: id, workspace_id(FK), user_id, name, segment_id(FK), template_id(FK), target_first_value_days, target_go_live_days, grace_days, active, created_at
- **risk_items**: id, workspace_id(FK), user_id, tracker_id(FK), account_id(FK), severity, score, reason, triage_status, assignee_id(FK), snoozed_until, created_at, updated_at
- **notifications**: id, workspace_id(FK), user_id, type, title, body, link, read, created_at
- **alert_rules**: id, workspace_id(FK), user_id, name, metric, comparator, threshold, severity, active, created_at
- **saved_views**: id, workspace_id(FK), user_id, name, kind, filters(jsonb), pinned, created_at
- **report_definitions**: id, workspace_id(FK), user_id, name, metrics(jsonb), filters(jsonb), schedule, created_at
- **report_snapshots**: id, workspace_id(FK), user_id, report_definition_id(FK), title, data(jsonb), created_at
- **shared_plans**: id, workspace_id(FK), user_id, tracker_id(FK), token(UNIQUE), title, active, snapshot(jsonb), created_at
- **import_jobs**: id, workspace_id(FK), user_id, source, kind, status, rows_total, rows_imported, errors(jsonb), created_at
- **plans**: id, name, price_cents, created_at
- **subscriptions**: id, user_id(UNIQUE), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files (mount under `/api/v1`)

All write endpoints require auth (`X-User-Id`) and enforce ownership (row `user_id` must equal caller). Reads marked "public" require no auth.

### 1. `workspaces.ts` → mount `workspaces`
- GET `/current` — auth — get-or-create caller's workspace — `Workspace`
- PUT `/current` — auth — update workspace settings/defaults — `Workspace`
- GET `/overview` — auth — KPI rollup (median TTV, on-time rate, ARR at risk, active, stalled, trends) — `{ kpis, trends, funnel }`

### 2. `segments.ts` → mount `segments`
- GET `/` — public — list segments (by workspace) — `Segment[]`
- GET `/:id` — public — segment detail — `Segment`
- POST `/` — auth — create segment — `Segment`
- PUT `/:id` — auth — update — `Segment`
- DELETE `/:id` — auth — delete — `{ success }`

### 3. `products.ts` → mount `products`
- GET `/` — public — list products — `Product[]`
- POST `/` — auth — create — `Product`
- PUT `/:id` — auth — update — `Product`
- DELETE `/:id` — auth — delete — `{ success }`

### 4. `stages.ts` → mount `stages`
- GET `/` — public — list stage library — `Stage[]`
- GET `/:id` — public — stage detail — `Stage`
- POST `/` — auth — create stage — `Stage`
- PUT `/:id` — auth — update — `Stage`
- DELETE `/:id` — auth — delete — `{ success }`

### 5. `templates.ts` → mount `templates`
- GET `/` — public — list journey templates — `Template[]`
- GET `/:id` — public — template + milestones — `{ template, milestones }`
- POST `/` — auth — create template — `Template`
- PUT `/:id` — auth — update template — `Template`
- POST `/:id/clone` — auth — clone template (new version/copy) — `Template`
- DELETE `/:id` — auth — archive/delete — `{ success }`
- POST `/:id/milestones` — auth — add milestone — `TemplateMilestone`
- PUT `/:id/milestones/:mid` — auth — update milestone — `TemplateMilestone`
- DELETE `/:id/milestones/:mid` — auth — delete milestone — `{ success }`
- PUT `/:id/milestones/reorder` — auth — reorder milestones — `TemplateMilestone[]`

### 6. `accounts.ts` → mount `accounts`
- GET `/` — public — list accounts (filter: segment, health, q) — `Account[]`
- GET `/:id` — public — account + linked tracker summary — `{ account, tracker }`
- POST `/` — auth — create account — `Account`
- PUT `/:id` — auth — update account — `Account`
- DELETE `/:id` — auth — delete — `{ success }`

### 7. `trackers.ts` → mount `trackers`
- GET `/` — public — list trackers (filter: status, manager, segment, q) — `Tracker[]`
- GET `/:id` — public — tracker + milestones + account + recent activity — `{ tracker, milestones, account, activity }`
- POST `/` — auth — create tracker from account+template (snapshots milestones) — `Tracker`
- PUT `/:id` — auth — update tracker (status, manager, etc.) — `Tracker`
- DELETE `/:id` — auth — delete — `{ success }`
- POST `/:id/advance` — auth — complete current milestone, advance to next, recompute TTV/projection/progress, log activity — `{ tracker, milestones }`
- POST `/:id/regress` — auth — move back a milestone, log activity — `{ tracker, milestones }`
- PUT `/:id/milestones/:mid` — auth — set milestone status (start/block/complete) — `TrackerMilestone`

### 8. `blockers.ts` → mount `blockers`
- GET `/` — public — list blockers (filter: tracker, status, category) — `Blocker[]`
- POST `/` — auth — open blocker — `Blocker`
- PUT `/:id` — auth — update blocker — `Blocker`
- POST `/:id/resolve` — auth — resolve blocker (set resolved_at) — `Blocker`
- POST `/:id/reopen` — auth — reopen — `Blocker`
- DELETE `/:id` — auth — delete — `{ success }`
- GET `/categories` — public — list blocker categories — `BlockerCategory[]`
- POST `/categories` — auth — create category — `BlockerCategory`
- GET `/friction` — public — systemic friction aggregation by category+stage — `{ byCategory, byStage }`

### 9. `notes.ts` → mount `notes`
- GET `/` — public — list notes (filter: tracker) — `Note[]`
- POST `/` — auth — create note — `Note`
- PUT `/:id` — auth — update / pin / visibility — `Note`
- DELETE `/:id` — auth — delete — `{ success }`

### 10. `tasks.ts` → mount `tasks`
- GET `/` — public — list tasks (filter: tracker, assignee, status) — `Task[]`
- GET `/mine` — auth — caller's assigned + overdue tasks — `Task[]`
- POST `/` — auth — create task — `Task`
- PUT `/:id` — auth — update task / status — `Task`
- DELETE `/:id` — auth — delete — `{ success }`

### 11. `activities.ts` → mount `activities`
- GET `/` — public — global audit/timeline (filter: tracker, account, type) — `Activity[]`
- POST `/` — auth — append manual activity entry — `Activity`

### 12. `sla.ts` → mount `sla`
- GET `/` — public — list SLA policies — `SlaPolicy[]`
- POST `/` — auth — create policy — `SlaPolicy`
- PUT `/:id` — auth — update — `SlaPolicy`
- DELETE `/:id` — auth — delete — `{ success }`
- GET `/attainment` — public — SLA attainment rate + breach list — `{ attainmentPct, breaches }`

### 13. `risk.ts` → mount `risk`
- GET `/` — public — at-risk queue (filter: triage_status, severity) — `RiskItem[]`
- POST `/recompute` — auth — recompute risk items across trackers — `{ created, updated }`
- PUT `/:id` — auth — update triage status / assignee — `RiskItem`
- POST `/:id/snooze` — auth — snooze risk item — `RiskItem`
- DELETE `/:id` — auth — dismiss — `{ success }`

### 14. `stall.ts` → mount `stall`
- GET `/` — public — ranked stalled accounts by ARR-weighted days overdue (filter: segment, manager, severity) — `StalledRow[]`
- GET `/summary` — public — ARR-at-risk + counts per severity band — `{ bands, totalArrAtRisk }`

### 15. `analytics.ts` → mount `analytics`
- GET `/ttv` — public — median/p75/p90 days-to-first-value & days-to-go-live (filter: segment, template, plan) — `{ firstValue, goLive }`
- GET `/cohorts` — public — TTV by cohort (start month / segment / plan / template) — `Cohort[]`
- GET `/stage-funnel` — public — avg days per stage across trackers — `StageFunnel[]`
- GET `/trend` — public — TTV trend over time (by month) — `TrendPoint[]`

### 16. `scorecards.ts` → mount `scorecards`
- GET `/` — public — per-manager scorecards (on-time rate, avg/median TTV, active load, stalled, ARR) — `Scorecard[]`
- GET `/:managerId` — public — single manager portfolio + metrics — `{ manager, metrics, trackers }`

### 17. `notifications.ts` → mount `notifications`
- GET `/` — auth — caller's notifications — `Notification[]`
- POST `/:id/read` — auth — mark read — `Notification`
- POST `/read-all` — auth — mark all read — `{ success }`
- POST `/generate` — auth — generate notifications from current at-risk/overdue state — `{ created }`

### 18. `alerts.ts` → mount `alerts`
- GET `/` — public — list alert rules — `AlertRule[]`
- POST `/` — auth — create rule — `AlertRule`
- PUT `/:id` — auth — update rule — `AlertRule`
- DELETE `/:id` — auth — delete — `{ success }`

### 19. `views.ts` → mount `views`
- GET `/` — public — list saved views (filter: kind) — `SavedView[]`
- POST `/` — auth — create saved view/cohort — `SavedView`
- PUT `/:id` — auth — update / pin — `SavedView`
- DELETE `/:id` — auth — delete — `{ success }`

### 20. `reports.ts` → mount `reports`
- GET `/` — public — list report definitions — `ReportDefinition[]`
- POST `/` — auth — create report definition — `ReportDefinition`
- PUT `/:id` — auth — update — `ReportDefinition`
- DELETE `/:id` — auth — delete — `{ success }`
- POST `/:id/run` — auth — generate snapshot from definition + current data — `ReportSnapshot`
- GET `/snapshots` — public — list snapshots — `ReportSnapshot[]`
- GET `/snapshots/:sid` — public — snapshot detail — `ReportSnapshot`

### 21. `share.ts` → mount `share`
- GET `/` — public — list caller-relevant shared plans (by workspace) — `SharedPlan[]`
- POST `/` — auth — create shareable plan from a tracker (token + snapshot) — `SharedPlan`
- PUT `/:id` — auth — toggle active / refresh snapshot — `SharedPlan`
- DELETE `/:id` — auth — revoke — `{ success }`
- GET `/public/:token` — public — fetch a shared plan by token (no auth, for `/plan/[token]`) — `{ plan, milestones, account }`

### 22. `imports.ts` → mount `imports`
- GET `/` — public — list import jobs — `ImportJob[]`
- POST `/accounts` — auth — import accounts from CSV rows (JSON array) — `ImportJob`
- POST `/connector` — auth — run a connector stub job — `ImportJob`
- POST `/seed-sample` — auth — provision a full demo workspace (templates, accounts, trackers, blockers, history) — `{ seeded, counts }`

### 23. `team.ts` → mount `team`
- GET `/` — public — list team members — `TeamMember[]`
- POST `/` — auth — create member — `TeamMember`
- PUT `/:id` — auth — update — `TeamMember`
- DELETE `/:id` — auth — delete — `{ success }`
- GET `/capacity` — public — active-load vs target-load per member — `CapacityRow[]`

### 24. `billing.ts` → mount `billing`
- GET `/plan` — (header user) — subscription + plan + stripeEnabled — `{ subscription, plan, stripeEnabled }`
- POST `/checkout` — (header user) — Stripe checkout session or 503 — `{ url }`
- POST `/portal` — (header user) — Stripe billing portal or 503 — `{ url }`
- POST `/webhook` — none — Stripe webhook handler or 503 — `{ received }`

(Health: `app.get('/health')` at root in `index.ts`, not a route file.)

---

## (c) lib/api.ts method list (name → relative `/api/proxy/...` path → verb)

```
// Workspace / overview
getWorkspace                 GET    /api/proxy/workspaces/current
updateWorkspace              PUT    /api/proxy/workspaces/current
getOverview                  GET    /api/proxy/workspaces/overview

// Segments
getSegments                  GET    /api/proxy/segments
getSegment                   GET    /api/proxy/segments/:id
createSegment                POST   /api/proxy/segments
updateSegment                PUT    /api/proxy/segments/:id
deleteSegment                DELETE /api/proxy/segments/:id

// Products
getProducts                  GET    /api/proxy/products
createProduct                POST   /api/proxy/products
updateProduct                PUT    /api/proxy/products/:id
deleteProduct                DELETE /api/proxy/products/:id

// Stages
getStages                    GET    /api/proxy/stages
getStage                     GET    /api/proxy/stages/:id
createStage                  POST   /api/proxy/stages
updateStage                  PUT    /api/proxy/stages/:id
deleteStage                  DELETE /api/proxy/stages/:id

// Templates
getTemplates                 GET    /api/proxy/templates
getTemplate                  GET    /api/proxy/templates/:id
createTemplate               POST   /api/proxy/templates
updateTemplate               PUT    /api/proxy/templates/:id
cloneTemplate                POST   /api/proxy/templates/:id/clone
deleteTemplate               DELETE /api/proxy/templates/:id
addTemplateMilestone         POST   /api/proxy/templates/:id/milestones
updateTemplateMilestone      PUT    /api/proxy/templates/:id/milestones/:mid
deleteTemplateMilestone      DELETE /api/proxy/templates/:id/milestones/:mid
reorderTemplateMilestones    PUT    /api/proxy/templates/:id/milestones/reorder

// Accounts
getAccounts                  GET    /api/proxy/accounts
getAccount                   GET    /api/proxy/accounts/:id
createAccount                POST   /api/proxy/accounts
updateAccount                PUT    /api/proxy/accounts/:id
deleteAccount                DELETE /api/proxy/accounts/:id

// Trackers
getTrackers                  GET    /api/proxy/trackers
getTracker                   GET    /api/proxy/trackers/:id
createTracker                POST   /api/proxy/trackers
updateTracker                PUT    /api/proxy/trackers/:id
deleteTracker                DELETE /api/proxy/trackers/:id
advanceTracker               POST   /api/proxy/trackers/:id/advance
regressTracker               POST   /api/proxy/trackers/:id/regress
updateTrackerMilestone       PUT    /api/proxy/trackers/:id/milestones/:mid

// Blockers
getBlockers                  GET    /api/proxy/blockers
createBlocker                POST   /api/proxy/blockers
updateBlocker                PUT    /api/proxy/blockers/:id
resolveBlocker               POST   /api/proxy/blockers/:id/resolve
reopenBlocker                POST   /api/proxy/blockers/:id/reopen
deleteBlocker                DELETE /api/proxy/blockers/:id
getBlockerCategories         GET    /api/proxy/blockers/categories
createBlockerCategory        POST   /api/proxy/blockers/categories
getFriction                  GET    /api/proxy/blockers/friction

// Notes
getNotes                     GET    /api/proxy/notes
createNote                   POST   /api/proxy/notes
updateNote                   PUT    /api/proxy/notes/:id
deleteNote                   DELETE /api/proxy/notes/:id

// Tasks
getTasks                     GET    /api/proxy/tasks
getMyTasks                   GET    /api/proxy/tasks/mine
createTask                   POST   /api/proxy/tasks
updateTask                   PUT    /api/proxy/tasks/:id
deleteTask                   DELETE /api/proxy/tasks/:id

// Activities
getActivities                GET    /api/proxy/activities
createActivity               POST   /api/proxy/activities

// SLA
getSlaPolicies               GET    /api/proxy/sla
createSlaPolicy              POST   /api/proxy/sla
updateSlaPolicy              PUT    /api/proxy/sla/:id
deleteSlaPolicy              DELETE /api/proxy/sla/:id
getSlaAttainment             GET    /api/proxy/sla/attainment

// Risk
getRiskItems                 GET    /api/proxy/risk
recomputeRisk                POST   /api/proxy/risk/recompute
updateRiskItem               PUT    /api/proxy/risk/:id
snoozeRiskItem               POST   /api/proxy/risk/:id/snooze
deleteRiskItem               DELETE /api/proxy/risk/:id

// Stall detector
getStalled                   GET    /api/proxy/stall
getStallSummary              GET    /api/proxy/stall/summary

// Analytics
getTtv                       GET    /api/proxy/analytics/ttv
getCohorts                   GET    /api/proxy/analytics/cohorts
getStageFunnel               GET    /api/proxy/analytics/stage-funnel
getTtvTrend                  GET    /api/proxy/analytics/trend

// Scorecards
getScorecards                GET    /api/proxy/scorecards
getScorecard                 GET    /api/proxy/scorecards/:managerId

// Notifications
getNotifications             GET    /api/proxy/notifications
markNotificationRead         POST   /api/proxy/notifications/:id/read
markAllNotificationsRead     POST   /api/proxy/notifications/read-all
generateNotifications        POST   /api/proxy/notifications/generate

// Alerts
getAlertRules                GET    /api/proxy/alerts
createAlertRule              POST   /api/proxy/alerts
updateAlertRule              PUT    /api/proxy/alerts/:id
deleteAlertRule              DELETE /api/proxy/alerts/:id

// Saved views
getViews                     GET    /api/proxy/views
createView                   POST   /api/proxy/views
updateView                   PUT    /api/proxy/views/:id
deleteView                   DELETE /api/proxy/views/:id

// Reports
getReports                   GET    /api/proxy/reports
createReport                 POST   /api/proxy/reports
updateReport                 PUT    /api/proxy/reports/:id
deleteReport                 DELETE /api/proxy/reports/:id
runReport                    POST   /api/proxy/reports/:id/run
getReportSnapshots           GET    /api/proxy/reports/snapshots
getReportSnapshot            GET    /api/proxy/reports/snapshots/:sid

// Share
getSharedPlans               GET    /api/proxy/share
createSharedPlan             POST   /api/proxy/share
updateSharedPlan             PUT    /api/proxy/share/:id
deleteSharedPlan             DELETE /api/proxy/share/:id
getPublicPlan                GET    /api/proxy/share/public/:token

// Imports
getImportJobs                GET    /api/proxy/imports
importAccounts               POST   /api/proxy/imports/accounts
runConnector                 POST   /api/proxy/imports/connector
seedSample                   POST   /api/proxy/imports/seed-sample

// Team
getTeam                      GET    /api/proxy/team
createTeamMember             POST   /api/proxy/team
updateTeamMember             PUT    /api/proxy/team/:id
deleteTeamMember             DELETE /api/proxy/team/:id
getTeamCapacity              GET    /api/proxy/team/capacity

// Billing
getBillingPlan               GET    /api/proxy/billing/plan
startCheckout                POST   /api/proxy/billing/checkout
openPortal                   POST   /api/proxy/billing/portal
```

(`billing/webhook` is hit by Stripe directly, not via lib/api.ts. `/plan/[token]` page calls `getPublicPlan`.)

---

## (d) Page list (URL → file under web/ → kind → api methods → renders)

### Public
1. `/` → `app/page.tsx` → public → (none) → static landing/marketing, feature grid, CTAs.
2. `/auth/sign-in` → `app/auth/sign-in/page.tsx` → public → (authClient) → sign-in form.
3. `/auth/sign-up` → `app/auth/sign-up/page.tsx` → public → (authClient) → sign-up form.
4. `/pricing` → `app/pricing/page.tsx` → public → getBillingPlan, startCheckout → plan tiers, upgrade CTA.
5. `/plan/[token]` → `app/plan/[token]/page.tsx` → public → getPublicPlan → read-only customer onboarding plan (milestones, progress, dates).

### Dashboard (auth, wrapped by `app/dashboard/layout.tsx` → `DashboardLayout`)
6. `/dashboard` → `app/dashboard/page.tsx` → dashboard → getOverview, getStalled, getTtv, getNotifications → exec KPIs, ARR-at-risk, stalled preview, TTV headline, trend.
7. `/dashboard/accounts` → `app/dashboard/accounts/page.tsx` → dashboard → getAccounts, getSegments, createAccount, deleteAccount → account directory table + create.
8. `/dashboard/accounts/[id]` → `app/dashboard/accounts/[id]/page.tsx` → dashboard → getAccount, updateAccount, getTracker, getActivities → account detail, linked tracker summary, edit.
9. `/dashboard/trackers` → `app/dashboard/trackers/page.tsx` → dashboard → getTrackers, getTeam, getViews, createView → tracker list with filters/saved views.
10. `/dashboard/trackers/new` → `app/dashboard/trackers/new/page.tsx` → dashboard → getAccounts, getTemplates, getTeam, createTracker → start-a-tracker wizard.
11. `/dashboard/trackers/[id]` → `app/dashboard/trackers/[id]/page.tsx` → dashboard → getTracker, advanceTracker, regressTracker, updateTrackerMilestone, getBlockers, createBlocker, resolveBlocker, getNotes, createNote, getTasks, createTask, createSharedPlan → tracker workspace (milestones, blockers, notes, tasks, share).
12. `/dashboard/templates` → `app/dashboard/templates/page.tsx` → dashboard → getTemplates, getSegments, getProducts, createTemplate, cloneTemplate, deleteTemplate → template list + create/clone.
13. `/dashboard/templates/[id]` → `app/dashboard/templates/[id]/page.tsx` → dashboard → getTemplate, updateTemplate, getStages, addTemplateMilestone, updateTemplateMilestone, deleteTemplateMilestone, reorderTemplateMilestones → milestone editor.
14. `/dashboard/stages` → `app/dashboard/stages/page.tsx` → dashboard → getStages, createStage, updateStage, deleteStage → stage library CRUD.
15. `/dashboard/stall-detector` → `app/dashboard/stall-detector/page.tsx` → dashboard → getStalled, getStallSummary, getTeam, getSegments → ranked stalled accounts + ARR-at-risk bands.
16. `/dashboard/analytics` → `app/dashboard/analytics/page.tsx` → dashboard → getTtv, getCohorts, getStageFunnel, getTtvTrend, getSegments, getTemplates → TTV percentiles, cohorts, stage funnel, trend.
17. `/dashboard/scorecards` → `app/dashboard/scorecards/page.tsx` → dashboard → getScorecards, getScorecard, getTeamCapacity → manager scorecards + capacity.
18. `/dashboard/blockers` → `app/dashboard/blockers/page.tsx` → dashboard → getBlockers, getFriction, getBlockerCategories, createBlockerCategory, resolveBlocker, reopenBlocker → blocker log + systemic friction.
19. `/dashboard/risk` → `app/dashboard/risk/page.tsx` → dashboard → getRiskItems, recomputeRisk, updateRiskItem, snoozeRiskItem, deleteRiskItem, getTeam → at-risk triage queue.
20. `/dashboard/tasks` → `app/dashboard/tasks/page.tsx` → dashboard → getTasks, getMyTasks, createTask, updateTask, deleteTask, getTeam → tasks / my-tasks board.
21. `/dashboard/sla` → `app/dashboard/sla/page.tsx` → dashboard → getSlaPolicies, createSlaPolicy, updateSlaPolicy, deleteSlaPolicy, getSlaAttainment, getSegments, getTemplates → SLA policies + attainment.
22. `/dashboard/notifications` → `app/dashboard/notifications/page.tsx` → dashboard → getNotifications, markNotificationRead, markAllNotificationsRead, generateNotifications, getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule → notifications feed + alert rules.
23. `/dashboard/reports` → `app/dashboard/reports/page.tsx` → dashboard → getReports, createReport, updateReport, deleteReport, runReport, getReportSnapshots, getReportSnapshot → report builder + snapshots.
24. `/dashboard/imports` → `app/dashboard/imports/page.tsx` → dashboard → getImportJobs, importAccounts, runConnector, seedSample → CSV import, connectors, sample seeder.
25. `/dashboard/team` → `app/dashboard/team/page.tsx` → dashboard → getTeam, createTeamMember, updateTeamMember, deleteTeamMember, getTeamCapacity → team directory.
26. `/dashboard/settings` → `app/dashboard/settings/page.tsx` → dashboard → getWorkspace, updateWorkspace, getSegments, createSegment, updateSegment, deleteSegment, getProducts, createProduct, updateProduct, deleteProduct, getViews, updateView, deleteView, getBillingPlan, startCheckout, openPortal → workspace settings, segments/products, saved views, billing.

Route handlers (not pages): `app/api/auth/[...path]/route.ts`, `app/api/proxy/[...path]/route.ts`.

---

## (e) DashboardLayout sidebar nav sections

```
Overview
  - Dashboard            /dashboard

Implementations
  - Accounts             /dashboard/accounts
  - Trackers             /dashboard/trackers
  - Stall Detector       /dashboard/stall-detector
  - At-Risk Queue        /dashboard/risk
  - Blockers             /dashboard/blockers
  - Tasks                /dashboard/tasks

Configuration
  - Journey Templates    /dashboard/templates
  - Stage Library        /dashboard/stages
  - SLA Policies         /dashboard/sla

Insights
  - Analytics            /dashboard/analytics
  - Scorecards           /dashboard/scorecards
  - Reports              /dashboard/reports

Workspace
  - Notifications        /dashboard/notifications
  - Team                 /dashboard/team
  - Data & Imports       /dashboard/imports
  - Settings             /dashboard/settings
```

---

## Consistency invariants (binding)

- 24 backend route files (workspaces, segments, products, stages, templates, accounts, trackers, blockers, notes, tasks, activities, sla, risk, stall, analytics, scorecards, notifications, alerts, views, reports, share, imports, team, billing).
- 26 pages (5 public + 21 dashboard).
- Every api method maps to exactly one backend endpoint; every endpoint (except `billing/webhook`) is exposed via one api method and consumed by at least one page.
- All tables carry `workspace_id` (except plans/subscriptions) and `user_id` for ownership scoping; writes filter/assert on caller `getUserId(c)`.
- `index.ts` runs `migrate()` (from `db/migrate.ts`) then `seedIfEmpty()` (plans 'free'/'pro') before `serve()`.
