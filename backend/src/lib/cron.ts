// ---------------------------------------------------------------------------
// cron.ts — THE ENGINE
//
// Pure, deterministic scheduling/firing functions. No external services, no
// DB access, no I/O. Routes import these helpers to validate expressions,
// project future firings, and detect scheduling hazards (collisions, DST
// traps, coverage gaps) across a set of jobs.
//
// Three "kinds" of schedule are supported uniformly:
//   - 'cron'   : a 5- or 6-field crontab expression, evaluated via cron-parser
//   - 'rate'   : a natural-language rate, e.g. "every 15 minutes", "every 2 hours"
//   - 'oneoff' : a single ISO timestamp; fires exactly once if in the future
// ---------------------------------------------------------------------------

import { CronExpressionParser } from 'cron-parser'

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface Job {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface Collision {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageWindow {
  start: string
  end: string
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const DEFAULT_TZ = 'UTC'

// ---------------------------------------------------------------------------
// Rate parsing — "every N <unit>" where unit ∈ minute(s)|hour(s)|day(s)
// ---------------------------------------------------------------------------
interface ParsedRate {
  n: number
  unit: 'minute' | 'hour' | 'day'
  ms: number
}

function parseRate(expr: string): ParsedRate | null {
  const m = /^every\s+(\d+)\s+(minute|hour|day)s?$/i.exec(expr.trim())
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2].toLowerCase() as 'minute' | 'hour' | 'day'
  const ms = unit === 'minute' ? n * MINUTE_MS : unit === 'hour' ? n * HOUR_MS : n * DAY_MS
  return { n, unit, ms }
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------
export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  const e = (expr ?? '').trim()
  if (!e) return { valid: false, error: 'Expression is empty' }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(e)
      return { valid: true }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  if (kind === 'rate') {
    const r = parseRate(e)
    if (!r) return { valid: false, error: 'Expected "every N minutes|hours|days"' }
    return { valid: true }
  }
  if (kind === 'oneoff') {
    const t = Date.parse(e)
    if (Number.isNaN(t)) return { valid: false, error: 'Not a valid ISO timestamp' }
    return { valid: true }
  }
  return { valid: false, error: `Unknown kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression — human-readable summary
// ---------------------------------------------------------------------------
export function describeExpression(kind: ScheduleKind, expr: string, timezone = DEFAULT_TZ): string {
  const e = (expr ?? '').trim()
  const v = validateExpression(kind, e)
  if (!v.valid) return `Invalid ${kind} expression: ${v.error}`
  if (kind === 'rate') {
    const r = parseRate(e)!
    return `Runs every ${r.n} ${r.unit}${r.n === 1 ? '' : 's'} (${timezone})`
  }
  if (kind === 'oneoff') {
    return `Runs once at ${new Date(e).toISOString()} (${timezone})`
  }
  // cron
  const parts = e.split(/\s+/)
  const [min, hour, dom, mon, dow] = parts
  const segs: string[] = []
  if (min === '*' && hour === '*') segs.push('every minute')
  else if (min !== '*' && hour === '*') segs.push(`at minute ${min} of every hour`)
  else if (hour !== '*' && min !== '*') segs.push(`at ${pad(hour)}:${pad(min)}`)
  else segs.push(`minute ${min}, hour ${hour}`)
  if (dom && dom !== '*') segs.push(`on day-of-month ${dom}`)
  if (mon && mon !== '*') segs.push(`in month ${mon}`)
  if (dow && dow !== '*') segs.push(`on weekday ${dow}`)
  return `${segs.join(', ')} (${timezone})`
}

function pad(s: string): string {
  return s.length === 1 && /^\d$/.test(s) ? `0${s}` : s
}

// ---------------------------------------------------------------------------
// nextFirings — project the next `count` firing instants as ISO UTC strings
// ---------------------------------------------------------------------------
export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone = DEFAULT_TZ,
  fromISO?: string,
  count = 10,
): string[] {
  const e = (expr ?? '').trim()
  const v = validateExpression(kind, e)
  if (!v.valid) return []
  const n = Math.max(0, Math.min(count, 10000))
  const fromDate = fromISO ? new Date(fromISO) : new Date()
  if (Number.isNaN(fromDate.getTime())) return []

  if (kind === 'cron') {
    const out: string[] = []
    try {
      const it = CronExpressionParser.parse(e, { tz: timezone, currentDate: fromDate })
      for (let i = 0; i < n; i++) {
        out.push(it.next().toDate().toISOString())
      }
    } catch {
      return []
    }
    return out
  }

  if (kind === 'rate') {
    const r = parseRate(e)
    if (!r) return []
    const out: string[] = []
    let t = fromDate.getTime() + r.ms
    for (let i = 0; i < n; i++) {
      out.push(new Date(t).toISOString())
      t += r.ms
    }
    return out
  }

  // oneoff: fires once if strictly in the future relative to fromDate
  const t = Date.parse(e)
  if (Number.isNaN(t)) return []
  if (t <= fromDate.getTime()) return []
  return n >= 1 ? [new Date(t).toISOString()] : []
}

// ---------------------------------------------------------------------------
// computeCollisions — bucket firings to the minute across a horizon; flag any
// minute where concurrency >= threshold, OR where >= 2 jobs share a resourceId.
// ---------------------------------------------------------------------------
export function computeCollisions(
  jobs: Job[],
  opts: { horizonDays?: number; threshold?: number } = {},
): Collision[] {
  const horizonDays = opts.horizonDays ?? 7
  const threshold = Math.max(2, opts.threshold ?? 2)
  const from = new Date()
  const horizonEnd = from.getTime() + horizonDays * DAY_MS

  // minuteKey -> { jobIds:Set, resourceCounts: Map<resourceId, count> }
  const buckets = new Map<number, { jobIds: Set<string>; resources: Map<string, Set<string>> }>()

  for (const job of jobs) {
    const fires = nextFirings(job.kind, job.expr, job.timezone ?? DEFAULT_TZ, from.toISOString(), 2000)
    for (const iso of fires) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      const minute = Math.floor(t / MINUTE_MS)
      let b = buckets.get(minute)
      if (!b) {
        b = { jobIds: new Set(), resources: new Map() }
        buckets.set(minute, b)
      }
      b.jobIds.add(job.id)
      if (job.resourceId) {
        let set = b.resources.get(job.resourceId)
        if (!set) {
          set = new Set()
          b.resources.set(job.resourceId, set)
        }
        set.add(job.id)
      }
    }
  }

  const out: Collision[] = []
  const sortedMinutes = [...buckets.keys()].sort((a, b) => a - b)
  for (const minute of sortedMinutes) {
    const b = buckets.get(minute)!
    const concurrency = b.jobIds.size
    // resource that has >= 2 distinct jobs in this minute
    let collidingResource: string | undefined
    let resourceMax = 0
    for (const [rid, set] of b.resources) {
      if (set.size >= 2 && set.size > resourceMax) {
        resourceMax = set.size
        collidingResource = rid
      }
    }
    const concurrencyHit = concurrency >= threshold
    const resourceHit = collidingResource !== undefined
    if (!concurrencyHit && !resourceHit) continue

    const windowStart = new Date(minute * MINUTE_MS).toISOString()
    const windowEnd = new Date((minute + 1) * MINUTE_MS).toISOString()
    out.push({
      windowStart,
      windowEnd,
      jobIds: [...b.jobIds],
      severity: severityForCount(Math.max(concurrency, resourceMax)),
      resourceId: collidingResource,
    })
  }
  return out
}

function severityForCount(count: number): 'low' | 'medium' | 'high' {
  if (count >= 5) return 'high'
  if (count >= 3) return 'medium'
  return 'low'
}

// ---------------------------------------------------------------------------
// loadHeatmap — count of total firings per hour bucket across the horizon
// ---------------------------------------------------------------------------
export function loadHeatmap(jobs: Job[], opts: { horizonDays?: number } = {}): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? 7
  const from = new Date()
  const horizonEnd = from.getTime() + horizonDays * DAY_MS

  const counts = new Map<number, number>()
  for (const job of jobs) {
    const fires = nextFirings(job.kind, job.expr, job.timezone ?? DEFAULT_TZ, from.toISOString(), 5000)
    for (const iso of fires) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      const hour = Math.floor(t / HOUR_MS)
      counts.set(hour, (counts.get(hour) ?? 0) + 1)
    }
  }

  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((hour) => ({ bucket: new Date(hour * HOUR_MS).toISOString(), count: counts.get(hour)! }))
}

// ---------------------------------------------------------------------------
// dstTraps — detect double-fires, skips, and ambiguous local times caused by
// timezone offset transitions across the window. Works by walking each local
// hour boundary and inspecting the UTC offset before/after.
// ---------------------------------------------------------------------------
export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone = DEFAULT_TZ,
  fromISO?: string,
  days = 365,
): DstTrap[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  if (timezone === 'UTC') return [] // UTC never transitions

  const from = fromISO ? new Date(fromISO) : new Date()
  if (Number.isNaN(from.getTime())) return []
  const end = from.getTime() + days * DAY_MS

  const traps: DstTrap[] = []
  // Sample every hour; a DST transition changes the offset between two adjacent hours.
  let prevOffset = tzOffsetMinutes(from, timezone)
  for (let t = from.getTime() + HOUR_MS; t <= end; t += HOUR_MS) {
    const d = new Date(t)
    const offset = tzOffsetMinutes(d, timezone)
    if (offset === prevOffset) {
      prevOffset = offset
      continue
    }
    const delta = offset - prevOffset // minutes; positive = clock moved forward (spring)
    const atUtc = d.toISOString()
    const atLocal = formatLocal(d, timezone)
    if (delta > 0) {
      // spring forward: a local hour is skipped
      traps.push({ type: 'skip', atLocal, atUtc })
    } else if (delta < 0) {
      // fall back: a local hour repeats -> ambiguous + potential double fire
      traps.push({ type: 'ambiguous', atLocal, atUtc })
      traps.push({ type: 'double_fire', atLocal, atUtc })
    }
    prevOffset = offset
  }
  return traps
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  // offset = local wall-clock - UTC, in minutes
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const asUTC = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    parseInt(map.hour === '24' ? '0' : map.hour, 10),
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  )
  return Math.round((asUTC - date.getTime()) / MINUTE_MS)
}

function formatLocal(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  const hour = map.hour === '24' ? '00' : map.hour
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`
}

// ---------------------------------------------------------------------------
// coverageGaps — given desired coverage windows and a set of jobs, find spans
// inside the windows where no job fires. A window is {start,end} ISO.
// ---------------------------------------------------------------------------
export function coverageGaps(
  windows: CoverageWindow[],
  jobs: Job[],
  opts: { horizonDays?: number } = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = new Date()
  const horizonEnd = now.getTime() + horizonDays * DAY_MS

  // Collect all firing instants across all jobs within the horizon.
  const fires: number[] = []
  for (const job of jobs) {
    const list = nextFirings(job.kind, job.expr, job.timezone ?? DEFAULT_TZ, now.toISOString(), 5000)
    for (const iso of list) {
      const t = Date.parse(iso)
      if (t > horizonEnd) break
      fires.push(t)
    }
  }
  fires.sort((a, b) => a - b)

  const gaps: CoverageGap[] = []
  for (const w of windows) {
    const wStart = Date.parse(w.start)
    const wEnd = Date.parse(w.end)
    if (Number.isNaN(wStart) || Number.isNaN(wEnd) || wEnd <= wStart) continue
    const inWindow = fires.filter((t) => t >= wStart && t <= wEnd)
    // boundaries to measure gaps: [wStart, ...fires..., wEnd]
    const points = [wStart, ...inWindow, wEnd]
    for (let i = 0; i < points.length - 1; i++) {
      const gapStart = points[i]
      const gapEnd = points[i + 1]
      const durationMinutes = Math.round((gapEnd - gapStart) / MINUTE_MS)
      // Report a gap only if there is meaningful uncovered time (>= 1 minute).
      if (durationMinutes >= 1) {
        gaps.push({
          gapStart: new Date(gapStart).toISOString(),
          gapEnd: new Date(gapEnd).toISOString(),
          durationMinutes,
        })
      }
    }
  }
  return gaps
}

// ---------------------------------------------------------------------------
// autoSpread — for jobs colliding above `threshold`, suggest a staggered cron
// expression that offsets the minute field to de-conflict.
// ---------------------------------------------------------------------------
export function autoSpread(jobs: Job[], opts: { threshold?: number } = {}): SpreadSuggestion[] {
  const threshold = Math.max(2, opts.threshold ?? 2)
  const collisions = computeCollisions(jobs, { threshold })
  if (collisions.length === 0) return []

  // Determine which jobs participate in any collision.
  const involved = new Set<string>()
  for (const c of collisions) for (const id of c.jobIds) involved.add(id)

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const suggestions: SpreadSuggestion[] = []
  let offset = 0
  for (const id of involved) {
    const job = jobById.get(id)
    if (!job) continue
    offset += 1
    if (job.kind === 'cron') {
      const parts = job.expr.trim().split(/\s+/)
      if (parts.length >= 5) {
        const newMinute = ((parseFirstMinute(parts[0]) + offset * 5) % 60 + 60) % 60
        const next = [String(newMinute), ...parts.slice(1)]
        suggestions.push({
          jobId: id,
          suggestedExpr: next.join(' '),
          reason: `Stagger minute field by ${offset * 5} to avoid collision with ${involved.size - 1} other job(s)`,
        })
        continue
      }
    }
    if (job.kind === 'rate') {
      const r = parseRate(job.expr)
      if (r) {
        // Suggest a small bump to the interval to break the lockstep.
        const bumped = r.n + 1
        suggestions.push({
          jobId: id,
          suggestedExpr: `every ${bumped} ${r.unit}${bumped === 1 ? '' : 's'}`,
          reason: `Bump interval to ${bumped} ${r.unit}(s) to break synchronized firing`,
        })
        continue
      }
    }
    suggestions.push({
      jobId: id,
      suggestedExpr: job.expr,
      reason: 'Manual review recommended; automatic staggering unavailable for this schedule kind',
    })
  }
  return suggestions
}

function parseFirstMinute(field: string): number {
  if (field === '*') return 0
  const first = field.split(/[,/-]/)[0]
  const n = parseInt(first, 10)
  return Number.isFinite(n) ? n : 0
}
