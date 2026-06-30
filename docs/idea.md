# Onboarding Time-to-Value Tracker

## Overview

Onboarding Time-to-Value Tracker is a Customer Success operations platform that tracks every new B2B SaaS customer through their implementation journey, measures time-to-value (TTV) against configurable SLAs, and flags stalled implementations before they convert into early churn. It gives VPs of Customer Success and Heads of Implementation a single operational surface to see which accounts are stuck, which implementation managers are at risk of missing go-live targets, and what systemic blockers are slowing the whole book of business down.

The platform is built around journey templates (the canonical sequence of onboarding milestones for a product or segment), per-account trackers (a live instance of a journey for one customer), a stall detector that ranks at-risk accounts by ARR and days overdue, and a deep analytics layer that computes median and percentile days-to-first-value and days-to-go-live by cohort, segment, and implementation manager.

All analysis is deterministic over uploaded, connected, or generated data. A built-in sample-data seeder makes the product demoable out of the box. All features are FREE for signed-in users; Stripe billing is wired but optional (returns 503 when unconfigured).

## Problem

Slow or stalled onboarding is one of the strongest leading indicators of first-year churn, and it directly delays revenue recognition. Yet most implementation teams run onboarding out of spreadsheets and project-management tools that were never designed to measure time-to-value. As a result:

- Leaders cannot see, at a glance, which implementations are stuck and how much ARR is at risk.
- Nobody measures time-to-first-value or days-to-go-live with statistical rigor (median, p90), so there is no baseline to improve against.
- Blockers are tracked ad hoc in notes, so systemic friction (e.g. "data migration always slips") is invisible.
- Implementation manager performance is anecdotal, not measured, so coaching and capacity planning are guesswork.
- There is no early-warning system: an account silently sits on the same milestone for 30 days and the first signal is a churned renewal.

## Target Users

- **VP of Customer Success** who owns a renewal/NRR number and wants early-warning signals on at-risk new logos.
- **Head of Implementation / Onboarding** who owns an implementation team, a go-live backlog, and TTV targets.
- **Implementation Managers / Onboarding Specialists** who run the day-to-day journey for a portfolio of accounts.
- **RevOps / CS Ops** analysts who configure templates, segments, SLAs, and build executive reporting.

### Buyer

VP of CS or Head of Implementation who owns a renewal/NRR number and an implementation team, with dedicated CS-tooling budget. Triggers: a churn spike attributed to slow onboarding, or a growing implementation backlog.

## Why this is NOT an existing project

Nearest near-neighbors and why they are distinct:

- **Employee-onboarding / DX-onboarding platforms** (internal HR or developer onboarding): these track *employees* joining a company, not *customers* implementing a product. Different subject, different stakeholders, different success metric.
- **Venture `onboarding-maze`** (in-app product UX funnels): tracks anonymous/end-user activation funnels and drop-off inside a product UI. This tool tracks *CS-led account implementation milestones* with human owners, blockers, and go-live SLAs, not pixel-level UX funnels.
- **`expansion-whitespace-mapper`**: maps cross-sell/upsell whitespace across an existing customer base. Different lifecycle stage (post-value expansion vs initial implementation).
- **`escalation-debt-ledger`**: tracks support escalations and their debt. Different signal (reactive support load vs proactive onboarding progress).
- **Generic project management (Asana/Jira) and CSM suites (Gainsight/Catalyst)**: project tools have no TTV statistics or stall detection; CSM suites focus on health scoring and renewals across the whole lifecycle, not implementation-milestone SLAs with percentile TTV analytics and implementation-manager scorecards.

The distinct wedge: **CS-led customer implementation milestone tracking with go-live SLAs, percentile time-to-value analytics, an ARR-weighted stall detector, and per-implementation-manager scorecards.**

## Major Feature Sections

### 1. Onboarding Journey Templates
- Create/edit/clone journey templates scoped to a product line and/or customer segment.
- Ordered milestone definitions with target days (cumulative and per-stage), owner role, and exit criteria.
- Designate a milestone as the "first value" milestone and the "go-live" milestone for TTV math.
- Versioning: editing a published template creates a new version; existing trackers keep their snapshotted version.
- Template library with default starter templates (SMB, Mid-Market, Enterprise).
- Activate/archive templates.

### 2. Milestone Definitions & Stage Library
- Reusable stage library (e.g. Kickoff, Data Migration, Integration, Training, UAT, Go-Live).
- Per-stage default target days, owner role, dependencies, and checklist items.
- Weighting of stages for progress-percentage computation.
- Stage categories (setup, technical, enablement, validation).

### 3. Per-Account Implementation Tracker
- Create a tracker for a customer account from a chosen template (snapshots the template version).
- Live state: current milestone, days elapsed in stage, total days elapsed, projected go-live date.
- Assign an implementation manager (owner) and CS owner.
- Per-milestone status (not started / in progress / blocked / complete) and completion timestamps.
- Manual milestone advance / regress with audit entry.
- Projected go-live recomputed from remaining target days vs elapsed.

### 4. Account Records & ARR
- Account directory: name, domain, segment, plan, ARR, contract start, target go-live.
- Link an account to its active tracker.
- ARR drives stall-detector ranking and at-risk dollar rollups.
- Account health snapshot (on-track / at-risk / stalled / live).

### 5. Stall Detector
- Rank accounts that are overdue on their current milestone by a composite risk score (ARR-weighted days overdue).
- Configurable stall thresholds (days over target per stage, days since last activity).
- Severity bands (watch / at-risk / critical) with ARR-at-risk rollup.
- Filter by segment, manager, template, and severity.
- One-click drill into the account tracker.

### 6. Time-to-Value Analytics
- Median and percentile (p50/p75/p90) days-to-first-value and days-to-go-live.
- Cohort analysis by contract-start month, segment, plan, and template.
- Trend over time (improving/regressing TTV).
- Funnel of stage completion times (which stage eats the most days).
- Comparison vs target (SLA attainment rate).

### 7. Blocker Log
- Log blockers against a tracker/milestone with a category, severity, owner, and opened/resolved timestamps.
- Blocker categories taxonomy (customer-side, data, integration, legal/procurement, resourcing, product gap).
- Time-blocked accumulation per account.
- Systemic friction view: blockers aggregated by category and stage to expose recurring friction.
- Resolve/reopen with audit.

### 8. Implementation Manager Scorecards
- Per-manager: on-time go-live rate, average and median TTV, active load, stalled count, ARR under management.
- Capacity view (active trackers per manager vs target load).
- Leaderboard ranking by on-time rate and median TTV.
- Drill into a manager's portfolio.

### 9. SLA Configuration & Policies
- Define SLA policies (target days-to-first-value, target days-to-go-live) per segment/template.
- Breach definitions and grace periods.
- SLA attainment reporting and breach list.

### 10. Customer-Facing Onboarding Plan & Export
- Generate a customer-facing onboarding plan from a tracker (milestones, owners, target dates, progress %).
- Shareable read-only plan snapshot (token-based public link, no auth) for the customer.
- Export plan/progress as JSON/CSV/printable HTML.

### 11. Activity Timeline & Audit Log
- Per-tracker chronological timeline (milestone advances, blockers, notes, owner changes, status changes).
- Account-level and global audit log.
- Filterable by type and actor.

### 12. Notes & Collaboration
- Threaded notes on a tracker or milestone.
- Mentions and pinned notes.
- Internal vs customer-visible note flag.

### 13. Tasks & Action Items
- Action items attached to a tracker/milestone with assignee, due date, status.
- My-tasks view across all assigned accounts.
- Overdue task surfacing.

### 14. Segments & Products
- Define customer segments (SMB/MM/ENT or custom) and product lines.
- Segment-level default templates and SLA policies.
- Segment rollups in analytics.

### 15. Cohort Builder & Saved Views
- Build cohorts by start month, segment, plan, template, manager.
- Save filter views for the tracker list and stall detector.
- Pin saved views to the dashboard.

### 16. Alerts & Notifications
- Per-user notifications when an owned account becomes at-risk/stalled, a milestone is overdue, or a task is due.
- Notification feed with mark-read.
- Alert rules (threshold-based) configurable per workspace.

### 17. Risk Scoring & At-Risk Queue
- Composite risk score per tracker (days overdue, blockers open, days since activity, ARR).
- At-risk queue with triage status (new / acknowledged / mitigating / resolved).
- Assign and snooze risk items.

### 18. Executive Dashboard & KPIs
- Top-line KPIs: median TTV, on-time go-live rate, ARR at risk, active implementations, stalled count.
- Trend sparklines and period-over-period deltas.
- Portfolio funnel and stage-time breakdown.

### 19. Reporting & Scheduled Reports
- Build and save report definitions (KPI set + filters).
- Generate point-in-time report snapshots.
- Export reports; scheduled report stubs.

### 20. Data Import / Connectors / Sample Seeder
- CSV import of accounts and trackers.
- Connector stubs (CRM/CS-tool) returning structured import jobs.
- Built-in sample-data seeder that provisions a realistic demo workspace (templates, accounts, trackers, blockers, history).

### 21. Workspace & Team Settings
- Workspace profile, default segment/template, business-day calendar for SLA math.
- Team member directory (implementation managers) and roles.
- Workspace-level defaults for stall thresholds.

### 22. Billing & Plans
- Plans (free/pro) and subscription state.
- Stripe-optional checkout/portal/webhook (503 when unconfigured).
- All features free for signed-in users.

## Data Model (tables)

- `workspaces` — tenant/workspace per user.
- `segments` — customer segments.
- `products` — product lines.
- `stages` — reusable stage library.
- `journey_templates` — onboarding journey templates (versioned).
- `template_milestones` — ordered milestones within a template.
- `accounts` — customer account records with ARR.
- `trackers` — per-account implementation tracker instances.
- `tracker_milestones` — snapshotted milestone state per tracker.
- `blockers` — blocker log entries.
- `blocker_categories` — blocker taxonomy.
- `notes` — notes on trackers/milestones.
- `tasks` — action items.
- `activities` — activity timeline / audit entries.
- `sla_policies` — SLA target definitions.
- `risk_items` — at-risk queue entries with triage.
- `notifications` — per-user notifications.
- `alert_rules` — threshold alert configuration.
- `saved_views` — saved filter views / cohorts.
- `report_definitions` — saved report configs.
- `report_snapshots` — generated report snapshots.
- `shared_plans` — public token-shared onboarding plans.
- `import_jobs` — data import / connector jobs.
- `team_members` — implementation managers / team directory.
- `plans` — billing plans.
- `subscriptions` — billing subscriptions.

## API Surface (high level)

REST under `/api/v1`. Public reads for shareable/demo data, auth-gated writes with ownership checks. Domains: workspaces, segments, products, stages, templates, accounts, trackers, milestones, blockers, notes, tasks, activities, sla, risk, notifications, alerts, views, analytics, scorecards, stall, reports, shared plans, imports, team, billing.

## Frontend Pages (~24)

Public:
1. `/` — landing (static marketing).
2. `/auth/sign-in` — sign in.
3. `/auth/sign-up` — sign up.
4. `/pricing` — pricing.
5. `/plan/[token]` — public shared onboarding plan.

Dashboard (auth, sidebar chrome):
6. `/dashboard` — executive KPI overview.
7. `/dashboard/accounts` — account directory.
8. `/dashboard/accounts/[id]` — account detail + tracker.
9. `/dashboard/trackers` — all implementation trackers.
10. `/dashboard/trackers/new` — start a tracker.
11. `/dashboard/templates` — journey templates list.
12. `/dashboard/templates/[id]` — template editor (milestones).
13. `/dashboard/stages` — stage library.
14. `/dashboard/stall-detector` — ranked stalled accounts.
15. `/dashboard/analytics` — TTV analytics & cohorts.
16. `/dashboard/scorecards` — implementation manager scorecards.
17. `/dashboard/blockers` — blocker log & systemic friction.
18. `/dashboard/risk` — at-risk queue.
19. `/dashboard/tasks` — action items / my tasks.
20. `/dashboard/sla` — SLA policies.
21. `/dashboard/notifications` — notifications feed.
22. `/dashboard/reports` — reports.
23. `/dashboard/imports` — data import & sample seeder.
24. `/dashboard/team` — team directory.
25. `/dashboard/settings` — workspace settings & billing.
