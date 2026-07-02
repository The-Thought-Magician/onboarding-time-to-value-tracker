'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Percentiles {
  median?: number | null
  p50?: number | null
  p75?: number | null
  p90?: number | null
  avg?: number | null
  count?: number | null
}
interface TtvResponse {
  firstValue?: Percentiles
  goLive?: Percentiles
}
interface Cohort {
  cohort?: string
  label?: string
  count?: number | null
  median_first_value_days?: number | null
  median_go_live_days?: number | null
  medianFirstValue?: number | null
  medianGoLive?: number | null
}
interface StageFunnelRow {
  stage_id?: string
  stage_name?: string
  name?: string
  category?: string | null
  avg_days?: number | null
  median_days?: number | null
  count?: number | null
  position?: number | null
}
interface TrendPoint {
  month?: string
  period?: string
  label?: string
  median_first_value_days?: number | null
  median_go_live_days?: number | null
  medianFirstValue?: number | null
  medianGoLive?: number | null
  count?: number | null
}
interface Segment {
  id: string
  name: string
}
interface Template {
  id: string
  name: string
}

function num(v?: number | null): number | null {
  return v == null || isNaN(Number(v)) ? null : Number(v)
}
function days(v?: number | null): string {
  const n = num(v)
  return n == null ? '—' : `${Math.round(n * 10) / 10}d`
}

function pctOf(p?: Percentiles): { median: number | null; p75: number | null; p90: number | null; avg: number | null; count: number | null } {
  if (!p) return { median: null, p75: null, p90: null, avg: null, count: null }
  return {
    median: num(p.median ?? p.p50),
    p75: num(p.p75),
    p90: num(p.p90),
    avg: num(p.avg),
    count: num(p.count),
  }
}

function cohortLabel(c: Cohort): string {
  return c.cohort ?? c.label ?? '—'
}
function cohortFv(c: Cohort): number | null {
  return num(c.median_first_value_days ?? c.medianFirstValue)
}
function cohortGl(c: Cohort): number | null {
  return num(c.median_go_live_days ?? c.medianGoLive)
}
function trendLabel(t: TrendPoint): string {
  return t.month ?? t.period ?? t.label ?? '—'
}
function trendFv(t: TrendPoint): number | null {
  return num(t.median_first_value_days ?? t.medianFirstValue)
}
function trendGl(t: TrendPoint): number | null {
  return num(t.median_go_live_days ?? t.medianGoLive)
}

const COHORT_BASIS = [
  { value: 'month', label: 'Start month' },
  { value: 'segment', label: 'Segment' },
  { value: 'plan', label: 'Plan' },
  { value: 'template', label: 'Template' },
]

export default function AnalyticsPage() {
  const [ttv, setTtv] = useState<TtvResponse | null>(null)
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [funnel, setFunnel] = useState<StageFunnelRow[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [segmentFilter, setSegmentFilter] = useState('')
  const [templateFilter, setTemplateFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [cohortBasis, setCohortBasis] = useState('month')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (segmentFilter) params.segment = segmentFilter
      if (templateFilter) params.template = templateFilter
      if (planFilter) params.plan = planFilter
      const [ttvData, cohortData, funnelData, trendData, segData, tplData] = await Promise.all([
        api.getTtv(params),
        api.getCohorts({ ...params, basis: cohortBasis }),
        api.getStageFunnel(params),
        api.getTtvTrend(params),
        api.getSegments(),
        api.getTemplates(),
      ])
      setTtv(ttvData ?? null)
      setCohorts(Array.isArray(cohortData) ? cohortData : [])
      setFunnel(Array.isArray(funnelData) ? funnelData : [])
      setTrend(Array.isArray(trendData) ? trendData : [])
      setSegments(Array.isArray(segData) ? segData : [])
      setTemplates(Array.isArray(tplData) ? tplData : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [segmentFilter, templateFilter, planFilter, cohortBasis])

  useEffect(() => {
    load()
  }, [load])

  const fv = useMemo(() => pctOf(ttv?.firstValue), [ttv])
  const gl = useMemo(() => pctOf(ttv?.goLive), [ttv])

  const maxFunnel = useMemo(
    () => Math.max(1, ...funnel.map((r) => num(r.avg_days ?? r.median_days) ?? 0)),
    [funnel]
  )

  const trendMax = useMemo(() => {
    const vals = trend.flatMap((t) => [trendFv(t) ?? 0, trendGl(t) ?? 0])
    return Math.max(1, ...vals)
  }, [trend])

  const hasAnyData =
    fv.median != null || gl.median != null || cohorts.length > 0 || funnel.length > 0 || trend.length > 0

  const activeFilters = segmentFilter || templateFilter || planFilter

  if (loading) return <PageSpinner label="Crunching time-to-value analytics..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Analytics</h1>
          <p className="mt-1 text-sm text-stone-400">
            Time-to-value distribution, cohort comparisons, stage funnel, and trend over time.
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

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Filters</span>
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
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="">All plans</option>
            <option value="enterprise">Enterprise</option>
            <option value="growth">Growth</option>
            <option value="starter">Starter</option>
            <option value="free">Free</option>
          </select>
          {activeFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSegmentFilter('')
                setTemplateFilter('')
                setPlanFilter('')
              }}
            >
              Clear
            </Button>
          )}
        </CardBody>
      </Card>

      {!hasAnyData ? (
        <EmptyState
          title="No analytics yet"
          description="Once trackers reach first value and go-live, time-to-value metrics will appear here. Seed sample data from Data & Imports to explore."
        />
      ) : (
        <>
          {/* Percentile stat cards */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-stone-200">Days to first value</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Median (p50)" value={days(fv.median)} tone="teal" sub={fv.count != null ? `${fv.count} accounts` : undefined} />
              <Stat label="p75" value={days(fv.p75)} tone="amber" />
              <Stat label="p90" value={days(fv.p90)} tone="red" />
              <Stat label="Average" value={days(fv.avg)} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-stone-200">Days to go-live</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Median (p50)" value={days(gl.median)} tone="teal" sub={gl.count != null ? `${gl.count} accounts` : undefined} />
              <Stat label="p75" value={days(gl.p75)} tone="amber" />
              <Stat label="p90" value={days(gl.p90)} tone="red" />
              <Stat label="Average" value={days(gl.avg)} />
            </div>
          </div>

          {/* Trend chart */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-stone-200">TTV trend over time</h2>
              <p className="mt-1 text-xs text-stone-500">Median days by month. Teal = first value, sky = go-live.</p>
            </CardHeader>
            <CardBody>
              {trend.length === 0 ? (
                <p className="text-sm text-stone-500">No trend data for the current filters.</p>
              ) : (
                <>
                  <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 180 }}>
                    {trend.map((t, i) => {
                      const fvv = trendFv(t) ?? 0
                      const glv = trendGl(t) ?? 0
                      const fvH = Math.round((fvv / trendMax) * 150)
                      const glH = Math.round((glv / trendMax) * 150)
                      return (
                        <div key={i} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
                          <div className="flex h-[150px] items-end gap-1">
                            <div
                              className="w-3 rounded-t bg-rose-500/70"
                              style={{ height: `${Math.max(fvH, fvv > 0 ? 3 : 0)}px` }}
                              title={`First value: ${days(fvv)}`}
                            />
                            <div
                              className="w-3 rounded-t bg-sky-500/70"
                              style={{ height: `${Math.max(glH, glv > 0 ? 3 : 0)}px` }}
                              title={`Go-live: ${days(glv)}`}
                            />
                          </div>
                          <span className="whitespace-nowrap text-[10px] text-stone-500">{trendLabel(t)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-stone-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/70" /> First value
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/70" /> Go-live
                    </span>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {/* Stage funnel */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-stone-200">Stage funnel</h2>
              <p className="mt-1 text-xs text-stone-500">Average days spent in each onboarding stage.</p>
            </CardHeader>
            <CardBody>
              {funnel.length === 0 ? (
                <p className="text-sm text-stone-500">No stage timing data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {funnel.map((r, i) => {
                    const d = num(r.avg_days ?? r.median_days) ?? 0
                    const pct = Math.round((d / maxFunnel) * 100)
                    return (
                      <div key={r.stage_id ?? i} className="flex items-center gap-3">
                        <div className="w-40 shrink-0 truncate text-sm text-stone-300" title={r.stage_name ?? r.name ?? ''}>
                          {r.stage_name ?? r.name ?? `Stage ${i + 1}`}
                        </div>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-stone-800">
                          <div
                            className="flex h-full items-center justify-end bg-rose-500/60 pr-2"
                            style={{ width: `${Math.max(pct, d > 0 ? 5 : 0)}%` }}
                          >
                            {pct > 25 && <span className="text-[10px] font-medium text-stone-950">{days(d)}</span>}
                          </div>
                        </div>
                        {pct <= 25 && <div className="w-12 shrink-0 text-right text-xs tabular-nums text-stone-400">{days(d)}</div>}
                        <div className="w-16 shrink-0 text-right text-xs tabular-nums text-stone-500">
                          {r.count != null ? `${r.count}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Cohorts table */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-stone-200">Cohorts</h2>
              <select
                value={cohortBasis}
                onChange={(e) => setCohortBasis(e.target.value)}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                {COHORT_BASIS.map((b) => (
                  <option key={b.value} value={b.value}>
                    By {b.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </CardHeader>
            <CardBody className="p-0">
              {cohorts.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No cohorts" description="No cohort data for the current basis and filters." />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Cohort</TH>
                      <TH className="text-right">Accounts</TH>
                      <TH className="text-right">Median first value</TH>
                      <TH className="text-right">Median go-live</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {cohorts.map((c, i) => (
                      <TR key={i}>
                        <TD className="font-medium text-stone-100">{cohortLabel(c)}</TD>
                        <TD className="text-right tabular-nums">{c.count ?? '—'}</TD>
                        <TD className="text-right tabular-nums text-rose-300">{days(cohortFv(c))}</TD>
                        <TD className="text-right tabular-nums text-sky-300">{days(cohortGl(c))}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
