'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface StalledRow {
  tracker_id?: string
  account_id?: string
  account_name?: string
  segment_id?: string | null
  segment_name?: string | null
  manager_id?: string | null
  manager_name?: string | null
  current_milestone?: string | null
  stage_name?: string | null
  days_overdue?: number | null
  days_stalled?: number | null
  arr_cents?: number | null
  arr_at_risk_cents?: number | null
  severity?: string | null
  risk_score?: number | null
  last_activity_at?: string | null
}

interface Band {
  severity?: string
  band?: string
  label?: string
  count?: number
  arr_cents?: number
  arr_at_risk_cents?: number
}

interface StallSummary {
  bands?: Band[]
  totalArrAtRisk?: number
}

interface TeamMember {
  id: string
  name: string
}
interface Segment {
  id: string
  name: string
  color?: string | null
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

const SEV_TONE: Record<string, 'red' | 'amber' | 'blue' | 'slate' | 'teal'> = {
  critical: 'red',
  high: 'amber',
  medium: 'blue',
  low: 'slate',
}

function fmtArr(cents?: number | null): string {
  const v = (cents ?? 0) / 100
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function severityOf(r: StalledRow): string {
  return (r.severity ?? '').toLowerCase()
}
function daysOverdueOf(r: StalledRow): number {
  return r.days_overdue ?? r.days_stalled ?? 0
}
function arrAtRiskOf(r: StalledRow): number {
  return r.arr_at_risk_cents ?? r.arr_cents ?? 0
}

export default function StallDetectorPage() {
  const [rows, setRows] = useState<StalledRow[]>([])
  const [summary, setSummary] = useState<StallSummary | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [segmentFilter, setSegmentFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (segmentFilter) params.segment = segmentFilter
      if (managerFilter) params.manager = managerFilter
      if (severityFilter) params.severity = severityFilter
      const [stalled, summ, teamData, segData] = await Promise.all([
        api.getStalled(params),
        api.getStallSummary(),
        api.getTeam(),
        api.getSegments(),
      ])
      setRows(Array.isArray(stalled) ? stalled : [])
      setSummary(summ ?? null)
      setTeam(Array.isArray(teamData) ? teamData : [])
      setSegments(Array.isArray(segData) ? segData : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stall detector')
    } finally {
      setLoading(false)
    }
  }, [segmentFilter, managerFilter, severityFilter])

  useEffect(() => {
    load()
  }, [load])

  // Client-side fallback filtering in case the backend returns the full set.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (segmentFilter && r.segment_id !== segmentFilter) return false
      if (managerFilter && r.manager_id !== managerFilter) return false
      if (severityFilter && severityOf(r) !== severityFilter) return false
      return true
    })
  }, [rows, segmentFilter, managerFilter, severityFilter])

  const ranked = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ar = arrAtRiskOf(b) * (daysOverdueOf(b) || 1) - arrAtRiskOf(a) * (daysOverdueOf(a) || 1)
        if (ar !== 0) return ar
        return daysOverdueOf(b) - daysOverdueOf(a)
      }),
    [filtered]
  )

  const bands = useMemo<Band[]>(() => {
    if (summary?.bands && summary.bands.length) return summary.bands
    // Derive bands from rows if summary doesn't supply them.
    const map = new Map<string, Band>()
    for (const r of filtered) {
      const sev = severityOf(r) || 'low'
      const cur = map.get(sev) ?? { severity: sev, count: 0, arr_at_risk_cents: 0 }
      cur.count = (cur.count ?? 0) + 1
      cur.arr_at_risk_cents = (cur.arr_at_risk_cents ?? 0) + arrAtRiskOf(r)
      map.set(sev, cur)
    }
    return SEVERITIES.map((s) => map.get(s)).filter(Boolean) as Band[]
  }, [summary, filtered])

  const totalArrAtRisk = useMemo(() => {
    if (summary?.totalArrAtRisk != null) return summary.totalArrAtRisk
    return filtered.reduce((acc, r) => acc + arrAtRiskOf(r), 0)
  }, [summary, filtered])

  const maxBandArr = useMemo(() => Math.max(1, ...bands.map((b) => b.arr_at_risk_cents ?? b.arr_cents ?? 0)), [bands])
  const criticalCount = useMemo(() => filtered.filter((r) => severityOf(r) === 'critical').length, [filtered])

  if (loading) return <PageSpinner label="Detecting stalled accounts..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Stall Detector</h1>
          <p className="mt-1 text-sm text-stone-400">
            Accounts stuck in onboarding, ranked by ARR-weighted days overdue. Triage the biggest revenue risks first.
          </p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button onClick={load} className="font-medium text-rose-200 underline hover:text-rose-100">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="ARR at risk" value={fmtArr(totalArrAtRisk)} tone="red" sub="Across all stalled accounts" />
        <Stat label="Stalled accounts" value={filtered.length} tone="amber" />
        <Stat label="Critical" value={criticalCount} tone="red" sub="Highest-severity band" />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">ARR-at-risk by severity band</h2>
        </CardHeader>
        <CardBody>
          {bands.length === 0 ? (
            <p className="text-sm text-stone-500">No stalled accounts in any band.</p>
          ) : (
            <div className="space-y-3">
              {bands.map((b) => {
                const sev = (b.severity ?? b.band ?? b.label ?? 'low').toLowerCase()
                const arr = b.arr_at_risk_cents ?? b.arr_cents ?? 0
                const pct = Math.round((arr / maxBandArr) * 100)
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <div className="w-20 shrink-0">
                      <Badge tone={SEV_TONE[sev] ?? 'slate'}>{sev}</Badge>
                    </div>
                    <div className="h-6 flex-1 overflow-hidden rounded-md bg-stone-800">
                      <div
                        className={`h-full ${
                          sev === 'critical'
                            ? 'bg-rose-500/70'
                            : sev === 'high'
                            ? 'bg-amber-500/70'
                            : sev === 'medium'
                            ? 'bg-sky-500/70'
                            : 'bg-stone-500/70'
                        }`}
                        style={{ width: `${Math.max(pct, arr > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <div className="w-28 shrink-0 text-right text-sm tabular-nums text-stone-300">{fmtArr(arr)}</div>
                    <div className="w-16 shrink-0 text-right text-xs tabular-nums text-stone-500">{b.count ?? 0} acct</div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="">All segments</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="">All managers</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {(segmentFilter || managerFilter || severityFilter) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSegmentFilter('')
                  setManagerFilter('')
                  setSeverityFilter('')
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <span className="text-xs text-stone-500">{ranked.length} stalled</span>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nothing is stalled"
                description="No onboarding accounts are currently overdue. Great work keeping momentum."
              />
            </div>
          ) : ranked.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No matches" description="No stalled accounts match the current filters." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10 text-right">#</TH>
                  <TH>Account</TH>
                  <TH>Stuck at</TH>
                  <TH>Segment</TH>
                  <TH>Owner</TH>
                  <TH className="text-right">Days overdue</TH>
                  <TH className="text-right">ARR at risk</TH>
                  <TH>Severity</TH>
                  <TH>Last activity</TH>
                </TR>
              </THead>
              <TBody>
                {ranked.map((r, i) => {
                  const sev = severityOf(r)
                  const name = r.account_name ?? 'Untitled account'
                  return (
                    <TR key={r.tracker_id ?? r.account_id ?? i}>
                      <TD className="text-right tabular-nums text-stone-500">{i + 1}</TD>
                      <TD className="font-medium text-stone-100">
                        {r.tracker_id ? (
                          <Link href={`/dashboard/trackers/${r.tracker_id}`} className="hover:text-rose-300">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </TD>
                      <TD>{r.current_milestone ?? r.stage_name ?? <span className="text-stone-600">—</span>}</TD>
                      <TD>{r.segment_name ?? <span className="text-stone-600">—</span>}</TD>
                      <TD>{r.manager_name ?? <span className="text-stone-600">Unassigned</span>}</TD>
                      <TD className="text-right tabular-nums text-amber-300">{daysOverdueOf(r)}d</TD>
                      <TD className="text-right tabular-nums font-medium text-stone-100">{fmtArr(arrAtRiskOf(r))}</TD>
                      <TD>{sev ? <Badge tone={SEV_TONE[sev] ?? 'slate'}>{sev}</Badge> : <span className="text-stone-600">—</span>}</TD>
                      <TD className="text-stone-400">{fmtDate(r.last_activity_at)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
