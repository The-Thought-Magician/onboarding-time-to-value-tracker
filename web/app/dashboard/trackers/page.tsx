'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Tone = 'default' | 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'slate'

interface Tracker {
  id: string
  account_id: string
  account_name?: string | null
  status?: string | null
  manager_id?: string | null
  manager_name?: string | null
  segment_id?: string | null
  segment_name?: string | null
  progress_pct?: number | null
  risk_score?: number | null
  started_at?: string | null
  first_value_at?: string | null
  go_live_at?: string | null
  projected_go_live?: string | null
  last_activity_at?: string | null
  current_milestone_id?: string | null
  arr_cents?: number | null
}

interface TeamMember {
  id: string
  name?: string | null
}

interface SavedView {
  id: string
  name: string
  kind?: string | null
  filters?: Record<string, unknown> | null
  pinned?: boolean
}

const STATUSES = ['active', 'stalled', 'blocked', 'paused', 'live', 'completed']

function statusTone(s?: string | null): Tone {
  switch ((s || '').toLowerCase()) {
    case 'active':
    case 'in_progress':
      return 'teal'
    case 'live':
    case 'completed':
    case 'go_live':
      return 'green'
    case 'stalled':
    case 'blocked':
      return 'red'
    case 'paused':
    case 'on_hold':
      return 'amber'
    default:
      return 'slate'
  }
}

function riskTone(score?: number | null): Tone {
  const s = score ?? 0
  if (s >= 60) return 'red'
  if (s >= 30) return 'amber'
  return 'green'
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TrackersPage() {
  const [trackers, setTrackers] = useState<Tracker[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [status, setStatus] = useState('')
  const [manager, setManager] = useState('')
  const [q, setQ] = useState('')
  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  // save view modal
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [savingView, setSavingView] = useState(false)

  const fetchTrackers = useCallback(async () => {
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (status) params.status = status
      if (manager) params.manager = manager
      if (q.trim()) params.q = q.trim()
      const res = await api.getTrackers(params)
      setTrackers(Array.isArray(res) ? res : res?.trackers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trackers')
    }
  }, [status, manager, q])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [t, v] = await Promise.allSettled([api.getTeam(), api.getViews({ kind: 'tracker' })])
    if (t.status === 'fulfilled') setTeam(Array.isArray(t.value) ? t.value : t.value?.team ?? [])
    if (v.status === 'fulfilled') setViews(Array.isArray(v.value) ? v.value : v.value?.views ?? [])
    await fetchTrackers()
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // re-fetch trackers when filters change (after initial load)
  useEffect(() => {
    if (loading) return
    fetchTrackers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, manager])

  function applyView(v: SavedView) {
    setActiveViewId(v.id)
    const f = (v.filters || {}) as Record<string, unknown>
    setStatus(typeof f.status === 'string' ? f.status : '')
    setManager(typeof f.manager === 'string' ? f.manager : '')
    setQ(typeof f.q === 'string' ? f.q : '')
  }

  function clearFilters() {
    setActiveViewId(null)
    setStatus('')
    setManager('')
    setQ('')
  }

  async function saveView() {
    if (!viewName.trim()) return
    setSavingView(true)
    try {
      const body = {
        name: viewName.trim(),
        kind: 'tracker',
        filters: { status, manager, q: q.trim() },
      }
      const created = await api.createView(body)
      const v: SavedView = created?.view ?? created
      setViews((prev) => [...prev, v])
      setActiveViewId(v.id)
      setSaveOpen(false)
      setViewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save view')
    } finally {
      setSavingView(false)
    }
  }

  const teamName = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of team) if (t.id) m.set(t.id, t.name || t.id)
    return m
  }, [team])

  // client-side q filter as a safety net on top of server filtering
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return trackers
    return trackers.filter((t) =>
      [t.account_name, t.status, t.segment_name].some((s) => (s || '').toLowerCase().includes(needle)),
    )
  }, [trackers, q])

  const kpis = useMemo(() => {
    const total = trackers.length
    const active = trackers.filter((t) => (t.status || '').toLowerCase() === 'active').length
    const stalled = trackers.filter((t) =>
      ['stalled', 'blocked'].includes((t.status || '').toLowerCase()),
    ).length
    const atRisk = trackers.filter((t) => (t.risk_score ?? 0) >= 60).length
    return { total, active, stalled, atRisk }
  }, [trackers])

  if (loading) return <PageSpinner label="Loading trackers..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Onboarding trackers</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every active and completed customer onboarding, with progress and risk.
          </p>
        </div>
        <Link href="/dashboard/trackers/new">
          <Button>Start a tracker</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total trackers" value={kpis.total} />
        <Stat label="Active" value={kpis.active} tone="teal" />
        <Stat label="Stalled / blocked" value={kpis.stalled} tone={kpis.stalled ? 'amber' : 'default'} />
        <Stat label="At risk" value={kpis.atRisk} tone={kpis.atRisk ? 'red' : 'default'} />
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">Saved views</span>
        <button
          onClick={clearFilters}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            activeViewId == null
              ? 'border-teal-500/40 bg-teal-500/15 text-teal-300'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          All trackers
        </button>
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => applyView(v)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              activeViewId === v.id
                ? 'border-teal-500/40 bg-teal-500/15 text-teal-300'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {v.pinned ? '★ ' : ''}
            {v.name}
          </button>
        ))}
        <button
          onClick={() => setSaveOpen(true)}
          className="rounded-full border border-dashed border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-teal-500/40 hover:text-teal-300"
        >
          + Save current filters
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 200 }}>
            <span className="text-xs font-medium text-slate-400">Search</span>
            <input
              className="input"
              placeholder="Account, status, segment..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchTrackers()
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Manager</span>
            <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
              <option value="">All managers</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={fetchTrackers}>
            Apply
          </Button>
          {(status || manager || q) && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              className="border-0"
              title={trackers.length === 0 ? 'No trackers yet' : 'No trackers match these filters'}
              description={
                trackers.length === 0
                  ? 'Start tracking an account onboarding to measure time-to-value.'
                  : 'Try clearing filters or widening your search.'
              }
              action={
                trackers.length === 0 ? (
                  <Link href="/dashboard/trackers/new">
                    <Button>Start a tracker</Button>
                  </Link>
                ) : (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Account</TH>
                  <TH>Status</TH>
                  <TH>Progress</TH>
                  <TH>Risk</TH>
                  <TH>Manager</TH>
                  <TH>Started</TH>
                  <TH>Projected go-live</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((t) => {
                  const progress = Math.max(0, Math.min(100, Math.round(t.progress_pct ?? 0)))
                  return (
                    <TR key={t.id} className="cursor-pointer">
                      <TD>
                        <Link
                          href={`/dashboard/trackers/${t.id}`}
                          className="font-medium text-slate-100 hover:text-teal-300"
                        >
                          {t.account_name || 'Account'}
                        </Link>
                        {t.segment_name && (
                          <div className="text-xs text-slate-500">{t.segment_name}</div>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={statusTone(t.status)}>{t.status || 'unknown'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-slate-400">{progress}%</span>
                        </div>
                      </TD>
                      <TD>
                        {t.risk_score != null ? (
                          <Badge tone={riskTone(t.risk_score)}>{t.risk_score}</Badge>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </TD>
                      <TD className="text-slate-400">
                        {t.manager_name || (t.manager_id ? teamName.get(t.manager_id) : null) || '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-slate-400">{fmtDate(t.started_at)}</TD>
                      <TD className="whitespace-nowrap text-slate-400">{fmtDate(t.projected_go_live)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save view"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={savingView}>
              Cancel
            </Button>
            <Button onClick={saveView} disabled={savingView || !viewName.trim()}>
              {savingView ? 'Saving...' : 'Save view'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Save the current filters as a reusable view. Captures status, manager, and search query.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">View name</span>
            <input
              className="input"
              autoFocus
              value={viewName}
              placeholder="e.g. Stalled enterprise"
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveView()
              }}
            />
          </label>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            <div>Status: {status || 'any'}</div>
            <div>Manager: {manager ? teamName.get(manager) || manager : 'any'}</div>
            <div>Search: {q.trim() || 'none'}</div>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(2 6 23);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(226 232 240);
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgb(45 212 191);
        }
      `}</style>
    </div>
  )
}
