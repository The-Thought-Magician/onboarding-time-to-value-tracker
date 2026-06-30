# Onboarding Time-to-Value Tracker

Onboarding Time-to-Value Tracker is a Customer Success operations platform that tracks every new B2B SaaS customer through their implementation journey, measures time-to-value (TTV) against configurable SLAs, and flags stalled implementations before they convert into early churn.

It gives VPs of Customer Success and Heads of Implementation a single operational surface to see which accounts are stuck, which implementation managers are at risk of missing go-live targets, and what systemic blockers are slowing the whole book of business down. The platform is built around journey templates, per-account trackers, an ARR-weighted stall detector, and a deep analytics layer that computes median and percentile days-to-first-value and days-to-go-live by cohort, segment, and implementation manager.

All analysis is deterministic over uploaded, connected, or generated data. A built-in sample-data seeder makes the product demoable out of the box.

See `docs/idea.md` for the full product specification and feature breakdown.

## Stack

- **Backend:** Hono (Node, TypeScript, ESM) running via `tsx`, with Drizzle ORM over Neon serverless Postgres.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4.
- **Auth:** Neon Auth (`@neondatabase/auth`). The Next.js server resolves the session and proxies requests to the backend with an `X-User-Id` header.
- **Database:** Neon Postgres (provisioned out-of-band; the app seeds sample data on first boot but does not create its own tables).
- **Package manager:** pnpm (always).

## Repository Layout

```
backend/   Hono API server (TypeScript, Drizzle, Neon)
web/        Next.js frontend
docs/       Product spec (idea.md) and audit
```

## Local Development

Prerequisites: Node 22+, pnpm, and a Neon Postgres connection string.

### Backend

```bash
cd backend
pnpm install
# create backend/.env (see env vars below)
pnpm dev   # node --import tsx/esm src/index.ts, serves on http://localhost:3001
```

### Frontend

```bash
cd web
pnpm install
# create web/.env.local (see env vars below)
pnpm dev   # next dev, serves on http://localhost:3000
```

The frontend calls the backend through a same-origin proxy at `/api/proxy/*`, which injects the authenticated `X-User-Id` header. Browser code never calls the backend directly.

### Docker

```bash
docker compose up --build
```

Brings the backend (port 3001) and web (port 3000) up together.

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
ADMIN_USER_IDS=
# Optional Stripe billing (returns 503 when unset)
# STRIPE_SECRET_KEY=
# STRIPE_PRO_PRICE_ID=
# STRIPE_WEBHOOK_SECRET=
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- `NEXT_PUBLIC_API_URL` is the only `NEXT_PUBLIC_*` var; it is baked into the bundle at build time and read by the proxy route.
- `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are server-only.

## Pricing

All features are FREE for signed-in users. Stripe billing is wired but optional: billing endpoints return `503` when Stripe is not configured, and the plan endpoint reports a free plan.
