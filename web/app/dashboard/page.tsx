'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import Stat from '@/components/ui/Stat'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/button'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import EmptyState from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'

interface Overview {
  kpis?: {
    medianTtv?: number
    medianFirstValue?: number
    onTimeRate?: number
    arrAtRisk?: number
    active?: number
    stalled?: number
    goLive?: number
    [k: string]: number | undefined
  }
  trends?: { month?: string; medianTtv?: number; value?: number }[]
  funnel?: { stage?: string; name?: string; avgDays?: number; count?: number }[]
}

interface StalledRow {
  id: string
  tracker_id?: string
  account_id?: string
  account_name?: string
  name?: string
  segment?: string
  manager?: string
  manager_name?: string
  days_overdue?: number
  arr_cents?: number
  arr_at_risk_cents?: number
  severity?: string
  risk_score?: number
}

interface Ttv {
  firstValue?: { p50?: number; p75?: number; p90?: number; median?: number; count?: number }
  goLive?: { p50?: number; p75?: number; p90?: number; median?: number; count?: number }
}

interface Notification {
  id: string
  type?: string
  title?: string
  body?: string
  link?: string
  read?: boolean
  created_at?: string
}

function fmtMoney(cents?: number): string {
  if (!cents || cents <= 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`
  return `$${dollars.toFixed(0)}`
}

function fmtDays(n?: number): string {
  if (n == null || isNaN(n)) return '—'
  return `${Math.round(n)}d`
}

function fmtPct(n?: number): string {
  if (n == null || isNaN(n)) return '—'
  // accept either 0-1 or 0-100
  const v = n <= 1 ? n * 100 : n
  return `${Math.round(v)}%`
}

function sevTone(s?: string): 'red' | 'amber' | 'teal' | 'slate' {
  switch ((s || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'red'
    case 'medium':
    case 'warning':
      return 'amber'
    case 'low':
      return 'teal'
    default:
      return 'slate'
  }
}

function fmtAgo(d?: string): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const diff = Date.now() - dt.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [stalled, setStalled] = useState<StalledRow[]>([])
  const [ttv, setTtv] = useState<Ttv | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [ov, st, tv, nf] = await Promise.all([
          api.getOverview().catch(() => null),
          api.getStalled().catch(() => []),
          api.getTtv().catch(() => null),
          api.getNotifications().catch(() => []),
        ])
        if (cancelled) return
        setOverview(ov)
        setStalled(Array.isArray(st) ? st : [])
        setTtv(tv)
        setNotifications(Array.isArray(nf) ? nf : [])
        if (!ov && (!Array.isArray(st) || st.length === 0) && !tv) {
          setError('Could not load dashboard data. The backend may be unavailable.')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <PageSpinner label="Loading dashboard..." />

  const kpis = overview?.kpis || {}
  const trends = (overview?.trends || []).filter((t) => t)
  const funnel = (overview?.funnel || []).filter((f) => f)
  const topStalled = [...stalled]
    .sort((a, b) => (b.arr_at_risk_cents ?? b.arr_cents ?? 0) - (a.arr_at_risk_cents ?? a.arr_cents ?? 0))
    .slice(0, 6)
  const unread = notifications.filter((n) => !n.read)
  const recentNotifs = notifications.slice(0, 6)

  const trendValues = trends.map((t) => Number(t.medianTtv ?? t.value ?? 0))
  const maxTrend = Math.max(1, ...trendValues)
  const maxFunnel = Math.max(1, ...funnel.map((f) => Number(f.avgDays ?? 0)))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Executive Overview</h1>
          <p className="mt-1 text-sm text-slate-400">Time-to-value health across your onboarding book.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/stall-detector"><Button variant="secondary" size="sm">Stall detector</Button></Link>
          <Link href="/dashboard/accounts"><Button size="sm">View accounts</Button></Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{error}</div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Median time-to-value"
          tone="teal"
          value={fmtDays(kpis.medianTtv ?? ttv?.goLive?.p50 ?? ttv?.goLive?.median)}
          sub={`First value ${fmtDays(kpis.medianFirstValue ?? ttv?.firstValue?.p50 ?? ttv?.firstValue?.median)}`}
        />
        <Stat
          label="On-time rate"
          tone={(kpis.onTimeRate ?? 0) >= 0.8 || (kpis.onTimeRate ?? 0) >= 80 ? 'green' : 'amber'}
          value={fmtPct(kpis.onTimeRate)}
          sub="Implementations hitting SLA"
        />
        <Stat
          label="ARR at risk"
          tone="red"
          value={fmtMoney(kpis.arrAtRisk)}
          sub={`${kpis.stalled ?? stalled.length} stalled accounts`}
        />
        <Stat
          label="Active implementations"
          value={kpis.active ?? '—'}
          sub={kpis.goLive != null ? `${kpis.goLive} gone live` : 'In flight now'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* TTV trend chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Median TTV trend</h2>
              <p className="text-xs text-slate-500">Lower is better</p>
            </div>
            <Link href="/dashboard/analytics" className="text-xs text-teal-400 hover:text-teal-300">Full analytics →</Link>
          </CardHeader>
          <CardBody>
            {trends.length === 0 ? (
              <EmptyState title="No trend data yet" description="Trends appear once trackers reach value milestones." />
            ) : (
              <div>
                <div className="flex h-44 items-end gap-2">
                  {trends.map((t, i) => {
                    const v = trendValues[i]
                    const h = Math.max(4, Math.round((v / maxTrend) * 100))
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[10px] tabular-nums text-slate-500">{v ? Math.round(v) : ''}</span>
                        <div
                          className="w-full rounded-t bg-teal-500/70 transition-all hover:bg-teal-400"
                          style={{ height: `${h}%` }}
                          title={`${t.month ?? ''}: ${Math.round(v)}d`}
                        />
                        <span className="truncate text-[10px] text-slate-500">{t.month ?? `#${i + 1}`}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Alerts</h2>
              {unread.length > 0 && <Badge tone="red">{unread.length}</Badge>}
            </div>
            <Link href="/dashboard/notifications" className="text-xs text-teal-400 hover:text-teal-300">All →</Link>
          </CardHeader>
          <CardBody>
            {recentNotifs.length === 0 ? (
              <EmptyState title="All clear" description="No notifications right now." />
            ) : (
              <ul className="space-y-3">
                {recentNotifs.map((n) => {
                  const inner = (
                    <div className={`rounded-lg border px-3 py-2 ${n.read ? 'border-slate-800 bg-slate-950/30' : 'border-teal-500/30 bg-teal-500/5'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-200">{n.title || n.type || 'Notification'}</span>
                        <span className="shrink-0 text-[10px] text-slate-500">{fmtAgo(n.created_at)}</span>
                      </div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>}
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.link ? <Link href={n.link}>{inner}</Link> : inner}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stalled preview */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Top ARR at risk</h2>
              <p className="text-xs text-slate-500">Stalled accounts by exposure</p>
            </div>
            <Link href="/dashboard/stall-detector" className="text-xs text-teal-400 hover:text-teal-300">Detector →</Link>
          </CardHeader>
          <CardBody className="p-0">
            {topStalled.length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState title="Nothing stalled" description="No accounts are currently overdue." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Account</TH>
                    <TH>Overdue</TH>
                    <TH>ARR at risk</TH>
                    <TH>Severity</TH>
                  </TR>
                </THead>
                <TBody>
                  {topStalled.map((s) => {
                    const target = s.account_id ? `/dashboard/accounts/${s.account_id}` : s.tracker_id ? `/dashboard/trackers/${s.tracker_id}` : null
                    const nameCell = s.account_name || s.name || 'Account'
                    return (
                      <TR key={s.id}>
                        <TD className="font-medium text-slate-100">
                          {target ? <Link href={target} className="hover:text-teal-300">{nameCell}</Link> : nameCell}
                          {s.segment && <div className="text-xs text-slate-500">{s.segment}</div>}
                        </TD>
                        <TD className="tabular-nums">{fmtDays(s.days_overdue)}</TD>
                        <TD className="tabular-nums text-rose-300">{fmtMoney(s.arr_at_risk_cents ?? s.arr_cents)}</TD>
                        <TD><Badge tone={sevTone(s.severity)}>{s.severity || 'n/a'}</Badge></TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Stage funnel */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Stage funnel</h2>
              <p className="text-xs text-slate-500">Avg days per stage</p>
            </div>
            <Link href="/dashboard/analytics" className="text-xs text-teal-400 hover:text-teal-300">Analytics →</Link>
          </CardHeader>
          <CardBody>
            {funnel.length === 0 ? (
              <EmptyState title="No stage data" description="Funnel builds as milestones complete." />
            ) : (
              <ul className="space-y-3">
                {funnel.map((f, i) => {
                  const v = Number(f.avgDays ?? 0)
                  const w = Math.max(3, Math.round((v / maxFunnel) * 100))
                  return (
                    <li key={i}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-slate-300">{f.name || f.stage || `Stage ${i + 1}`}</span>
                        <span className="tabular-nums text-slate-500">{fmtDays(v)}{f.count != null ? ` · ${f.count}` : ''}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${w}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* TTV percentiles */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-100">Time-to-value distribution</h2>
          <p className="text-xs text-slate-500">Days across all completed implementations</p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[
              { label: 'Days to first value', d: ttv?.firstValue },
              { label: 'Days to go-live', d: ttv?.goLive },
            ].map((g) => (
              <div key={g.label} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{g.label}</span>
                  {g.d?.count != null && <span className="text-xs text-slate-500">{g.d.count} samples</span>}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(['p50', 'p75', 'p90'] as const).map((p) => (
                    <div key={p}>
                      <div className="text-xs uppercase text-slate-500">{p}</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums text-teal-300">{fmtDays(g.d?.[p] ?? (p === 'p50' ? g.d?.median : undefined))}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
