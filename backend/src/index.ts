import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import { plans } from './db/schema.js'

// Domain route files (authored separately; all `export default router`).
import workspacesRoutes from './routes/workspaces.js'
import segmentsRoutes from './routes/segments.js'
import productsRoutes from './routes/products.js'
import stagesRoutes from './routes/stages.js'
import templatesRoutes from './routes/templates.js'
import accountsRoutes from './routes/accounts.js'
import trackersRoutes from './routes/trackers.js'
import blockersRoutes from './routes/blockers.js'
import notesRoutes from './routes/notes.js'
import tasksRoutes from './routes/tasks.js'
import activitiesRoutes from './routes/activities.js'
import slaRoutes from './routes/sla.js'
import riskRoutes from './routes/risk.js'
import stallRoutes from './routes/stall.js'
import analyticsRoutes from './routes/analytics.js'
import scorecardsRoutes from './routes/scorecards.js'
import notificationsRoutes from './routes/notifications.js'
import alertsRoutes from './routes/alerts.js'
import viewsRoutes from './routes/views.js'
import reportsRoutes from './routes/reports.js'
import shareRoutes from './routes/share.js'
import importsRoutes from './routes/imports.js'
import teamRoutes from './routes/team.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://onboarding-time-to-value-tracker.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

const api = new Hono()
api.route('/workspaces', workspacesRoutes)
api.route('/segments', segmentsRoutes)
api.route('/products', productsRoutes)
api.route('/stages', stagesRoutes)
api.route('/templates', templatesRoutes)
api.route('/accounts', accountsRoutes)
api.route('/trackers', trackersRoutes)
api.route('/blockers', blockersRoutes)
api.route('/notes', notesRoutes)
api.route('/tasks', tasksRoutes)
api.route('/activities', activitiesRoutes)
api.route('/sla', slaRoutes)
api.route('/risk', riskRoutes)
api.route('/stall', stallRoutes)
api.route('/analytics', analyticsRoutes)
api.route('/scorecards', scorecardsRoutes)
api.route('/notifications', notificationsRoutes)
api.route('/alerts', alertsRoutes)
api.route('/views', viewsRoutes)
api.route('/reports', reportsRoutes)
api.route('/share', shareRoutes)
api.route('/imports', importsRoutes)
api.route('/team', teamRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// Idempotent seed: billing plans + a couple of demo rows. Count-then-insert so
// it is safe to run on every boot.
async function seedIfEmpty() {
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      { id: 'free', name: 'Free', price_cents: 0 },
      { id: 'pro', name: 'Pro', price_cents: 4900 },
    ])
    console.log('Seeded plans (free, pro)')
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately, THEN provision schema + seed (both idempotent).
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

try {
  await migrate()
} catch (e) {
  console.error('Migration error:', e)
}

try {
  await seedIfEmpty()
} catch (e) {
  console.error('Seed error:', e)
}

export default app
