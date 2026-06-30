'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface RiskItem {
  id: string
  tracker_id?: string | null
  account_id?: string | null
  account_name?: string | null
  name?: string | null
  severity?: string | null
  score?: number | null
  reason?: string | null
  triage_status?: string | null
  triageStatus?: string | null
  assignee_id?: string | null
  assigneeId?: string | null
  snoozed_until?: string | null
  snoozedUntil?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface TeamMember {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
}

function str(...vals: Array<string | null | undefined>): string {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v
  return ''
}

function num(...vals: Array<number | null | undefined>): number {
  for (const v of vals) if (typeof v === 'number' && !Number.isNaN(v)) return v
  return 0
}

function sevTone(sev: string, score: number): 'red' | 'amber' | 'blue' {
  const s = sev.toLowerCase()
  if (s === 'critical' || s === 'high' || score >= 70) return 'red'
  if (s === 'medium' || score >= 40) return 'amber'
  return 'blue'
}

const TRIAGE_STATUSES = ['open', 'investigating', 'mitigating', 'resolved', 'accepted']

function isSnoozed(item: RiskItem): boolean {
  const until = str(item.snoozed_until, item.snoozedUntil)
  if (!until) return false
  const t = new Date(until).getTime()
  return !Number.isNaN(t) && t > Date.now()
}

export default function RiskPage() {
  const [items, setItems] = useState<RiskItem[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const [triageFilter, setTriageFilter] = useState<string>('open')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showSnoozed, setShowSnoozed] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [snoozeId, setSnoozeId] = useState<string | null>(null)
  const [snoozeDate, setSnoozeDate] = useState('')
  const [snoozeBusy, setSnoozeBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [r, t] = await Promise.all([api.getRiskItems(), api.getTeam()])
      setItems(Array.isArray(r) ? r : [])
      setTeam(Array.isArray(t) ? t : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risk queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function reloadItems() {
    try {
      const r = await api.getRiskItems()
      setItems(Array.isArray(r) ? r : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reload risk items')
    }
  }

  async function onRecompute() {
    setRecomputing(true)
    setError(null)
    setFlash(null)
    try {
      const res = await api.recomputeRisk()
      await reloadItems()
      const created = num((res as Record<string, number>)?.created)
      const updated = num((res as Record<string, number>)?.updated)
      setFlash(`Recompute complete — ${created} new, ${updated} updated.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recompute risk')
    } finally {
      setRecomputing(false)
    }
  }

  async function setTriage(id: string, status: string) {
    setBusyId(id)
    try {
      await api.updateRiskItem(id, { triage_status: status })
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update triage status')
    } finally {
      setBusyId(null)
    }
  }

  async function setAssignee(id: string, assigneeId: string) {
    setBusyId(id)
    try {
      await api.updateRiskItem(id, { assignee_id: assigneeId || null })
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign')
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Dismiss this risk item?')) return
    setBusyId(id)
    try {
      await api.deleteRiskItem(id)
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss')
    } finally {
      setBusyId(null)
    }
  }

  function openSnooze(id: string) {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    setSnoozeDate(d.toISOString().slice(0, 10))
    setSnoozeId(id)
  }

  async function confirmSnooze() {
    if (!snoozeId) return
    setSnoozeBusy(true)
    try {
      await api.snoozeRiskItem(snoozeId, { snoozed_until: new Date(snoozeDate).toISOString() })
      setSnoozeId(null)
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to snooze')
    } finally {
      setSnoozeBusy(false)
    }
  }

  // Bulk actions
  async function bulkTriage(status: string) {
    const ids = [...selected]
    if (ids.length === 0) return
    setError(null)
    try {
      await Promise.all(ids.map((id) => api.updateRiskItem(id, { triage_status: status })))
      setSelected(new Set())
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk update failed')
    }
  }

  async function bulkDismiss() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Dismiss ${ids.length} risk item(s)?`)) return
    setError(null)
    try {
      await Promise.all(ids.map((id) => api.deleteRiskItem(id)))
      setSelected(new Set())
      await reloadItems()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk dismiss failed')
    }
  }

  const teamById = useMemo(() => {
    const m = new Map<string, TeamMember>()
    for (const t of team) m.set(t.id, t)
    return m
  }, [team])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((it) => {
        const triage = str(it.triage_status, it.triageStatus).toLowerCase()
        const snoozed = isSnoozed(it)
        if (!showSnoozed && snoozed) return false
        if (triageFilter !== 'all' && triage !== triageFilter) return false
        if (severityFilter !== 'all') {
          const s = str(it.severity).toLowerCase()
          if (s !== severityFilter) return false
        }
        if (q) {
          const hay = `${str(it.account_name, it.name)} ${str(it.reason)}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => num(b.score) - num(a.score))
  }, [items, triageFilter, severityFilter, search, showSnoozed])

  const stats = useMemo(() => {
    const active = items.filter((i) => str(i.triage_status, i.triageStatus).toLowerCase() !== 'resolved')
    const high = active.filter((i) => num(i.score) >= 70 || ['critical', 'high'].includes(str(i.severity).toLowerCase()))
    const snoozed = items.filter(isSnoozed)
    const unassigned = active.filter((i) => !str(i.assignee_id, i.assigneeId))
    return { active: active.length, high: high.length, snoozed: snoozed.length, unassigned: unassigned.length }
  }, [items])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set()
      return new Set(filtered.map((f) => f.id))
    })
  }

  if (loading) return <PageSpinner label="Loading at-risk queue..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">At-Risk Triage Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            Prioritize onboardings drifting off track and assign owners to intervene.
          </p>
        </div>
        <Button size="sm" disabled={recomputing} onClick={onRecompute}>
          {recomputing ? 'Recomputing...' : 'Recompute Risk'}
        </Button>
      </div>

      {flash && (
        <Card className="border-teal-500/40">
          <CardBody className="flex items-center justify-between gap-4">
            <span className="text-sm text-teal-300">{flash}</span>
            <button onClick={() => setFlash(null)} className="text-slate-500 hover:text-slate-200">
              ✕
            </button>
          </CardBody>
        </Card>
      )}

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active Items" value={stats.active} tone={stats.active > 0 ? 'amber' : 'default'} />
        <Stat label="High / Critical" value={stats.high} tone={stats.high > 0 ? 'red' : 'default'} />
        <Stat label="Unassigned" value={stats.unassigned} tone={stats.unassigned > 0 ? 'amber' : 'default'} />
        <Stat label="Snoozed" value={stats.snoozed} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Queue</h2>
            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1">
                <span className="text-xs text-teal-300">{selected.size} selected</span>
                <Button variant="ghost" size="sm" onClick={() => bulkTriage('investigating')}>
                  Investigate
                </Button>
                <Button variant="ghost" size="sm" onClick={() => bulkTriage('resolved')}>
                  Resolve
                </Button>
                <Button variant="ghost" size="sm" onClick={bulkDismiss}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account / reason..."
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <select
              value={triageFilter}
              onChange={(e) => setTriageFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value="all">All triage</option>
              {TRIAGE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value="all">All severities</option>
              {['critical', 'high', 'medium', 'low'].map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showSnoozed}
                onChange={(e) => setShowSnoozed(e.target.checked)}
                className="rounded border-slate-600 bg-slate-950 text-teal-500 focus:ring-teal-500"
              />
              Show snoozed
            </label>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? 'No risk items' : 'Nothing matches these filters'}
              description={
                items.length === 0
                  ? 'Run "Recompute Risk" to scan trackers and surface at-risk onboardings.'
                  : 'Adjust the triage, severity, or snooze filters to see more.'
              }
              action={
                items.length === 0 ? (
                  <Button size="sm" disabled={recomputing} onClick={onRecompute}>
                    {recomputing ? 'Recomputing...' : 'Recompute Risk'}
                  </Button>
                ) : undefined
              }
              className="m-4"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-600 bg-slate-950 text-teal-500 focus:ring-teal-500"
                    />
                  </TH>
                  <TH>Account</TH>
                  <TH className="text-right">Score</TH>
                  <TH>Severity</TH>
                  <TH>Reason</TH>
                  <TH>Assignee</TH>
                  <TH>Triage</TH>
                  <TH className="text-right"></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((it) => {
                  const triage = str(it.triage_status, it.triageStatus) || 'open'
                  const score = num(it.score)
                  const assignee = str(it.assignee_id, it.assigneeId)
                  const snoozed = isSnoozed(it)
                  const busy = busyId === it.id
                  return (
                    <TR key={it.id} className={selected.has(it.id) ? 'bg-teal-500/5' : ''}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggleSelect(it.id)}
                          className="rounded border-slate-600 bg-slate-950 text-teal-500 focus:ring-teal-500"
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">
                            {str(it.account_name, it.name) || 'Account'}
                          </span>
                          {snoozed && <Badge tone="slate">snoozed</Badge>}
                        </div>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${score >= 70 ? 'bg-rose-500' : score >= 40 ? 'bg-amber-400' : 'bg-sky-400'}`}
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-slate-200">{Math.round(score)}</span>
                        </div>
                      </TD>
                      <TD>
                        {it.severity ? (
                          <Badge tone={sevTone(str(it.severity), score)}>{str(it.severity)}</Badge>
                        ) : (
                          <Badge tone={sevTone('', score)}>{score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'}</Badge>
                        )}
                      </TD>
                      <TD className="max-w-xs">
                        <span className="line-clamp-2 text-xs text-slate-400">{str(it.reason) || '—'}</span>
                      </TD>
                      <TD>
                        <select
                          value={assignee}
                          disabled={busy}
                          onChange={(e) => setAssignee(it.id, e.target.value)}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                        >
                          <option value="">Unassigned</option>
                          {team.map((t) => (
                            <option key={t.id} value={t.id}>
                              {str(t.name, t.email) || 'Member'}
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD>
                        <select
                          value={triage}
                          disabled={busy}
                          onChange={(e) => setTriage(it.id, e.target.value)}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                        >
                          {TRIAGE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s[0].toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => openSnooze(it.id)}>
                            Snooze
                          </Button>
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(it.id)}>
                            Dismiss
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {assigneeHint(team)}

      <Modal
        open={snoozeId !== null}
        onClose={() => setSnoozeId(null)}
        title="Snooze Risk Item"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSnoozeId(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={snoozeBusy || !snoozeDate} onClick={confirmSnooze}>
              {snoozeBusy ? 'Snoozing...' : 'Snooze'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Hide this item from the active queue until the chosen date.</p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Snooze until</label>
            <input
              type="date"
              value={snoozeDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSnoozeDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function assigneeHint(team: TeamMember[]) {
  if (team.length > 0) return null
  return (
    <p className="text-xs text-slate-500">
      No team members yet — add members in the Team page to enable risk assignment.
    </p>
  )
}
