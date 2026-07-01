import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// pg emits 'error' on the pool whenever an idle client is terminated by the
// server (e.g. Neon closing idle connections). Without a listener, Node
// treats this as an uncaught exception and crashes the whole process, which
// causes the platform to restart the service and serve its own 404/502 page
// to unrelated in-flight requests until the process comes back up.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err)
})

export const db = drizzle(pool, { schema })
