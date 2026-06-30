'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Scorecard {
  manager_id?: string | null
  managerId?: string | null
  manager_name?: string | null
  name?: string | null
  email?: string | null
  on_time_rate?: number | null
  onTimeRate?: number | null
  avg_ttv?: number | null
  avgTtv?: number | null
  median_ttv?: number | null
  medianTtv?: number | null
  active_load?: number | null
  activeLoad?: number | null
  stalled?: number | null
  stalled_count?: number | null
  arr_cents?: number | null
  arrCents?: number | null
  arr?: number | null
}

interface CapacityRow {
  member_id?: string | null
  id?: string | null
  name?: string | null
  email?: string | null
  role?: string | null
  active_load?: number | null
  activeLoad?: number | null
  target_load?: number | null
  targetLoad?: number | null
  utilization?: number | null
}

interface ScorecardDetail {
  manager?: Record<string, unknown> | null
  metrics?: Record<string, unknown> | null
  trackers?: Array<Record<string, unknown>> | null
}

function num(...vals: Array<number | null | undefined>): number {
  for (const v of vals) if (typeof v === 'number' && !Number.isNaN(v)) return v
  return 0
}

function str(...vals: Array<string | null | undefined>): string {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v
  return ''
}

function fmtCurrency(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`
  return `$${dollars.toFixed(0)}`
}

function fmtPct(v: number): string {
  return `${Math.round(v * (v <= 1 ? 100 : 1))}%`
}

function fmtDays(v: number): string {
  if (!v) return '—'
  return `${v.toFixed(v < 10 ? 1 : 0)}d`
}

function rateTone(rate: number): 'green' | 'amber' | 'red' {
  const pct = rate <= 1 ? rate * 100 : rate
  if (pct >= 80) return 'green'
  if (pct >= 60) return 'amber'
  return 'red'
}

function utilTone(util: number): 'teal' | 'amber' | 'red' {
  if (util > 1.1) return 'red'
  if (util > 0.85) return 'amber'
  return 'teal'
}

export default function ScorecardsPage() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [capacity, setCapacity] = useState<CapacityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'ttv' | 'ontime' | 'load' | 'arr'>('arr')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ScorecardDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [sc, cap] = await Promise.all([api.getScorecards(), api.getTeamCapacity()])
      setScorecards(Array.isArray(sc) ? sc : [])
      setCapacity(Array.isArray(cap) ? cap : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scorecards')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function openDetail(id: string) {
    if (!id) return
    setDetailId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const d = await api.getScorecard(id)
      setDetail(d as ScorecardDetail)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load manager portfolio')
    } finally {
      setDetailLoading(false)
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = scorecards.map((s) => ({
      id: str(s.manager_id, s.managerId),
      name: str(s.manager_name, s.name, s.email) || 'Unassigned',
      email: str(s.email),
      onTime: num(s.on_time_rate, s.onTimeRate),
      avgTtv: num(s.avg_ttv, s.avgTtv),
      medianTtv: num(s.median_ttv, s.medianTtv),
      activeLoad: num(s.active_load, s.activeLoad),
      stalled: num(s.stalled, s.stalled_count),
      arr: num(s.arr_cents, s.arrCents, s.arr),
    }))
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    list.sort((a, b) => {
      if (sortKey === 'ttv') return a.medianTtv - b.medianTtv
      if (sortKey === 'ontime') return b.onTime - a.onTime
      if (sortKey === 'load') return b.activeLoad - a.activeLoad
      return b.arr - a.arr
    })
    return list
  }, [scorecards, search, sortKey])

  const totals = useMemo(() => {
    const managers = rows.length
    const activeLoad = rows.reduce((s, r) => s + r.activeLoad, 0)
    const stalled = rows.reduce((s, r) => s + r.stalled, 0)
    const arr = rows.reduce((s, r) => s + r.arr, 0)
    const onTimeVals = rows.filter((r) => r.onTime > 0).map((r) => (r.onTime <= 1 ? r.onTime * 100 : r.onTime))
    const avgOnTime = onTimeVals.length ? onTimeVals.reduce((a, b) => a + b, 0) / onTimeVals.length : 0
    return { managers, activeLoad, stalled, arr, avgOnTime }
  }, [rows])

  const capRows = useMemo(() => {
    return capacity.map((c) => {
      const active = num(c.active_load, c.activeLoad)
      const target = num(c.target_load, c.targetLoad)
      const util = typeof c.utilization === 'number' ? c.utilization : target > 0 ? active / target : 0
      return {
        id: str(c.member_id, c.id),
        name: str(c.name, c.email) || 'Member',
        role: str(c.role),
        active,
        target,
        util,
      }
    })
  }, [capacity])

  if (loading) return <PageSpinner label="Loading scorecards..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Manager Scorecards</h1>
          <p className="mt-1 text-sm text-slate-400">
            On-time delivery, time-to-value, and active load across the CS team.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-rose-500/40">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-sm text-rose-300">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Managers" value={totals.managers} />
        <Stat label="Avg On-Time" value={`${Math.round(totals.avgOnTime)}%`} tone={rateTone(totals.avgOnTime)} />
        <Stat label="Active Load" value={totals.activeLoad} tone="teal" />
        <Stat label="Stalled" value={totals.stalled} tone={totals.stalled > 0 ? 'amber' : 'default'} />
        <Stat label="ARR Managed" value={fmtCurrency(totals.arr)} tone="teal" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Scorecards</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search managers..."
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value="arr">Sort: ARR</option>
              <option value="ontime">Sort: On-Time</option>
              <option value="ttv">Sort: Median TTV</option>
              <option value="load">Sort: Active Load</option>
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="No scorecards yet"
              description="Once trackers are assigned to managers, their performance metrics will appear here."
              className="m-4"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Manager</TH>
                  <TH className="text-right">On-Time</TH>
                  <TH className="text-right">Median TTV</TH>
                  <TH className="text-right">Avg TTV</TH>
                  <TH className="text-right">Active</TH>
                  <TH className="text-right">Stalled</TH>
                  <TH className="text-right">ARR</TH>
                  <TH className="text-right"></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id || r.name}>
                    <TD>
                      <div className="font-medium text-slate-100">{r.name}</div>
                      {r.email && <div className="text-xs text-slate-500">{r.email}</div>}
                    </TD>
                    <TD className="text-right">
                      {r.onTime > 0 ? (
                        <Badge tone={rateTone(r.onTime)}>{fmtPct(r.onTime)}</Badge>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{fmtDays(r.medianTtv)}</TD>
                    <TD className="text-right tabular-nums">{fmtDays(r.avgTtv)}</TD>
                    <TD className="text-right tabular-nums">{r.activeLoad}</TD>
                    <TD className="text-right tabular-nums">
                      {r.stalled > 0 ? <span className="text-amber-300">{r.stalled}</span> : r.stalled}
                    </TD>
                    <TD className="text-right tabular-nums">{r.arr ? fmtCurrency(r.arr) : '—'}</TD>
                    <TD className="text-right">
                      {r.id ? (
                        <Button variant="ghost" size="sm" onClick={() => openDetail(r.id)}>
                          View
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-200">Team Capacity</h2>
          <p className="mt-1 text-xs text-slate-500">Active onboarding load vs. target load per member.</p>
        </CardHeader>
        <CardBody>
          {capRows.length === 0 ? (
            <EmptyState
              title="No capacity data"
              description="Add team members with a target load to track utilization."
            />
          ) : (
            <div className="space-y-3">
              {capRows.map((c) => {
                const pct = c.target > 0 ? Math.min((c.active / c.target) * 100, 130) : c.active > 0 ? 100 : 0
                const tone = utilTone(c.util)
                const barColor =
                  tone === 'red' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-teal-400'
                return (
                  <div key={c.id || c.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{c.name}</span>
                        {c.role && <span className="text-xs text-slate-500">{c.role}</span>}
                      </div>
                      <div className="flex items-center gap-2 tabular-nums text-slate-400">
                        <span>
                          {c.active} / {c.target || '∞'}
                        </span>
                        <Badge tone={tone}>{Math.round((c.util || 0) * 100)}%</Badge>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${Math.max(pct, c.active > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="Manager Portfolio"
        className="max-w-2xl"
      >
        {detailLoading ? (
          <div className="py-8">
            <Spinner label="Loading portfolio..." />
          </div>
        ) : detailError ? (
          <div className="py-6 text-sm text-rose-300">{detailError}</div>
        ) : detail ? (
          <ManagerDetail detail={detail} />
        ) : null}
      </Modal>
    </div>
  )
}

function ManagerDetail({ detail }: { detail: ScorecardDetail }) {
  const manager = detail.manager || {}
  const metrics = detail.metrics || {}
  const trackers = Array.isArray(detail.trackers) ? detail.trackers : []

  const name = str(manager.name as string, manager.email as string) || 'Manager'

  const metricEntries = Object.entries(metrics).filter(([, v]) => typeof v === 'number' || typeof v === 'string')

  return (
    <div className="space-y-5">
      <div>
        <div className="text-base font-semibold text-slate-100">{name}</div>
        {manager.email ? <div className="text-xs text-slate-500">{String(manager.email)}</div> : null}
      </div>

      {metricEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metricEntries.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{k.replace(/_/g, ' ')}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-slate-100">
                {typeof v === 'number'
                  ? k.toLowerCase().includes('arr')
                    ? fmtCurrency(v)
                    : k.toLowerCase().includes('rate') || k.toLowerCase().includes('pct')
                      ? fmtPct(v)
                      : v % 1 !== 0
                        ? v.toFixed(1)
                        : v
                  : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Portfolio ({trackers.length})
        </div>
        {trackers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
            No active trackers assigned.
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {trackers.map((t, i) => {
              const tName = str(
                t.account_name as string,
                t.name as string,
                t.account as string,
              ) || `Tracker ${i + 1}`
              const status = str(t.status as string)
              const progress = num(t.progress_pct as number, t.progress as number)
              const risk = num(t.risk_score as number)
              return (
                <div
                  key={(t.id as string) || i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-200">{tName}</div>
                    <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {risk > 0 && (
                      <Badge tone={risk >= 70 ? 'red' : risk >= 40 ? 'amber' : 'slate'}>risk {Math.round(risk)}</Badge>
                    )}
                    {status && <Badge tone={status === 'stalled' ? 'amber' : 'teal'}>{status}</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
