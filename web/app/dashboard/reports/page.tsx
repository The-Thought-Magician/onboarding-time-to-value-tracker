'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ReportDefinition {
  id: string
  workspace_id?: string
  user_id?: string
  name: string
  metrics?: string[] | null
  filters?: Record<string, unknown> | null
  schedule?: string | null
  created_at?: string
}

interface ReportSnapshot {
  id: string
  workspace_id?: string
  user_id?: string
  report_definition_id?: string | null
  title: string
  data?: Record<string, unknown> | null
  created_at?: string
}

const METRICS = [
  { key: 'median_ttv', label: 'Median Time-to-Value' },
  { key: 'p75_ttv', label: 'P75 Time-to-Value' },
  { key: 'p90_ttv', label: 'P90 Time-to-Value' },
  { key: 'on_time_rate', label: 'On-Time Rate' },
  { key: 'arr_at_risk', label: 'ARR at Risk' },
  { key: 'active_trackers', label: 'Active Trackers' },
  { key: 'stalled_count', label: 'Stalled Accounts' },
  { key: 'sla_attainment', label: 'SLA Attainment' },
  { key: 'stage_funnel', label: 'Stage Funnel' },
  { key: 'blocker_friction', label: 'Blocker Friction' },
]

const METRIC_LABEL: Record<string, string> = Object.fromEntries(
  METRICS.map((m) => [m.key, m.label]),
)

const SCHEDULES = [
  { key: '', label: 'Manual only' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

const SCHEDULE_LABEL: Record<string, string> = Object.fromEntries(
  SCHEDULES.map((s) => [s.key, s.label]),
)

function fmtDateTime(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface FormState {
  name: string
  metrics: string[]
  filterSegment: string
  filterTemplate: string
  schedule: string
}

const emptyForm: FormState = {
  name: '',
  metrics: ['median_ttv', 'on_time_rate'],
  filterSegment: '',
  filterTemplate: '',
  schedule: '',
}

function flattenSnapshotRows(data: Record<string, unknown> | null | undefined): Array<{ label: string; value: string }> {
  if (!data || typeof data !== 'object') return []
  const rows: Array<{ label: string; value: string }> = []
  const stringify = (v: unknown): string => {
    if (v == null) return '—'
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (typeof v === 'string') return v
    if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      const keys = Object.keys(o)
      if (keys.length <= 3) return keys.map((k) => `${k}: ${stringify(o[k])}`).join(', ')
      return `${keys.length} fields`
    }
    return String(v)
  }
  for (const [k, v] of Object.entries(data)) {
    rows.push({ label: METRIC_LABEL[k] ?? k.replace(/_/g, ' '), value: stringify(v) })
  }
  return rows
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportDefinition[]>([])
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ReportDefinition | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const [viewSnapshot, setViewSnapshot] = useState<ReportSnapshot | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [defs, snaps] = await Promise.all([
        api.getReports(),
        api.getReportSnapshots().catch(() => []),
      ])
      setReports(Array.isArray(defs) ? defs : [])
      setSnapshots(Array.isArray(snaps) ? snaps : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const reportById = useMemo(() => {
    const m = new Map<string, ReportDefinition>()
    for (const r of reports) m.set(r.id, r)
    return m
  }, [reports])

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter((r) => r.name.toLowerCase().includes(q))
  }, [reports, search])

  const stats = useMemo(() => {
    const scheduled = reports.filter((r) => r.schedule).length
    const latest = snapshots[0]?.created_at
    return {
      definitions: reports.length,
      scheduled,
      snapshots: snapshots.length,
      latest: latest ? fmtDateTime(latest) : '—',
    }
  }, [reports, snapshots])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: ReportDefinition) {
    setEditing(r)
    const filters = (r.filters ?? {}) as Record<string, unknown>
    setForm({
      name: r.name ?? '',
      metrics: Array.isArray(r.metrics) ? r.metrics : [],
      filterSegment: typeof filters.segment === 'string' ? filters.segment : '',
      filterTemplate: typeof filters.template === 'string' ? filters.template : '',
      schedule: r.schedule ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  function toggleMetric(key: string) {
    setForm((f) => ({
      ...f,
      metrics: f.metrics.includes(key)
        ? f.metrics.filter((m) => m !== key)
        : [...f.metrics, key],
    }))
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Report name is required')
      return
    }
    if (form.metrics.length === 0) {
      setFormError('Select at least one metric')
      return
    }
    setBusy(true)
    setFormError(null)
    const filters: Record<string, string> = {}
    if (form.filterSegment.trim()) filters.segment = form.filterSegment.trim()
    if (form.filterTemplate.trim()) filters.template = form.filterTemplate.trim()
    const payload = {
      name: form.name.trim(),
      metrics: form.metrics,
      filters,
      schedule: form.schedule || null,
    }
    try {
      if (editing) {
        await api.updateReport(editing.id, payload)
      } else {
        await api.createReport(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save report')
    } finally {
      setBusy(false)
    }
  }

  async function runReport(r: ReportDefinition) {
    setBusy(true)
    setError(null)
    try {
      const snap = await api.runReport(r.id)
      await load()
      if (snap && typeof snap === 'object' && 'id' in snap) {
        setViewSnapshot(snap as ReportSnapshot)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run report')
    } finally {
      setBusy(false)
    }
  }

  async function removeReport(r: ReportDefinition) {
    if (!confirm(`Delete report "${r.name}"? Snapshots are retained.`)) return
    setBusy(true)
    try {
      await api.deleteReport(r.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete report')
    } finally {
      setBusy(false)
    }
  }

  async function openSnapshot(s: ReportSnapshot) {
    // Fetch full detail (list view may carry trimmed data).
    setSnapshotLoading(true)
    setViewSnapshot(s)
    try {
      const full = await api.getReportSnapshot(s.id)
      if (full && typeof full === 'object') setViewSnapshot(full as ReportSnapshot)
    } catch {
      // Keep list version on failure.
    } finally {
      setSnapshotLoading(false)
    }
  }

  if (loading) return <PageSpinner label="Loading reports..." />

  const snapshotRows = flattenSnapshotRows(viewSnapshot?.data)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Build reusable report definitions and capture point-in-time snapshots of onboarding metrics.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Report</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button className="text-rose-200 hover:text-white" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Report definitions" value={stats.definitions} tone="teal" />
        <Stat label="Scheduled" value={stats.scheduled} />
        <Stat label="Snapshots" value={stats.snapshots} tone="green" />
        <Stat label="Latest snapshot" value={<span className="text-base">{stats.latest}</span>} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Report Builder</h2>
          <input
            type="search"
            placeholder="Search reports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </CardHeader>
        {filteredReports.length === 0 ? (
          <CardBody>
            <EmptyState
              icon="📊"
              title={search ? 'No matching reports' : 'No report definitions yet'}
              description="Define which metrics and filters a report should capture, then run it to produce a snapshot."
              action={!search ? <Button onClick={openCreate}>+ New Report</Button> : undefined}
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Report</TH>
                <TH>Metrics</TH>
                <TH>Schedule</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredReports.map((r) => {
                const metrics = Array.isArray(r.metrics) ? r.metrics : []
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="font-medium text-slate-100">{r.name}</div>
                      {r.filters && Object.keys(r.filters).length > 0 && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {Object.entries(r.filters)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {metrics.slice(0, 4).map((m) => (
                          <Badge key={m} tone="slate">
                            {METRIC_LABEL[m] ?? m}
                          </Badge>
                        ))}
                        {metrics.length > 4 && (
                          <span className="text-xs text-slate-500">+{metrics.length - 4}</span>
                        )}
                        {metrics.length === 0 && <span className="text-xs text-slate-600">None</span>}
                      </div>
                    </TD>
                    <TD>
                      {r.schedule ? (
                        <Badge tone="blue">{SCHEDULE_LABEL[r.schedule] ?? r.schedule}</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">Manual</span>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-400">{fmtDateTime(r.created_at)}</TD>
                    <TD className="text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" onClick={() => runReport(r)} disabled={busy}>
                          Run
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeReport(r)} disabled={busy}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-200">Snapshots</h2>
          <p className="mt-1 text-xs text-slate-500">
            Captured report outputs. Click a snapshot to view its data.
          </p>
        </CardHeader>
        {snapshots.length === 0 ? (
          <CardBody>
            <EmptyState
              icon="🗂"
              title="No snapshots yet"
              description="Run a report definition to capture a snapshot of current metrics."
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Snapshot</TH>
                <TH>Source report</TH>
                <TH>Captured</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {snapshots.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <button
                      className="text-left font-medium text-slate-100 hover:text-teal-300"
                      onClick={() => openSnapshot(s)}
                    >
                      {s.title || 'Untitled snapshot'}
                    </button>
                  </TD>
                  <TD className="text-slate-400">
                    {s.report_definition_id
                      ? reportById.get(s.report_definition_id)?.name ?? 'Deleted report'
                      : '—'}
                  </TD>
                  <TD className="text-xs text-slate-400">{fmtDateTime(s.created_at)}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => openSnapshot(s)}>
                      View
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Report' : 'New Report'}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Report'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Report name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              placeholder="e.g. Weekly TTV Executive Summary"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">
              Metrics ({form.metrics.length} selected)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {METRICS.map((m) => {
                const on = form.metrics.includes(m.key)
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMetric(m.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      on
                        ? 'border-teal-500/60 bg-teal-500/10 text-teal-200'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                        on ? 'border-teal-400 bg-teal-500 text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Segment filter (optional)</label>
              <input
                value={form.filterSegment}
                onChange={(e) => setForm({ ...form, filterSegment: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
                placeholder="Segment ID"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Template filter (optional)</label>
              <input
                value={form.filterTemplate}
                onChange={(e) => setForm({ ...form, filterTemplate: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
                placeholder="Template ID"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Schedule</label>
            <select
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              {SCHEDULES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {editing && (
            <div className="border-t border-slate-800 pt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setModalOpen(false)
                  removeReport(editing)
                }}
                disabled={busy}
              >
                Delete Report
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={viewSnapshot !== null}
        onClose={() => setViewSnapshot(null)}
        title={viewSnapshot?.title || 'Snapshot'}
        className="max-w-2xl"
        footer={
          <Button variant="secondary" onClick={() => setViewSnapshot(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="text-xs text-slate-500">
            Captured {fmtDateTime(viewSnapshot?.created_at)}
          </div>
          {snapshotLoading ? (
            <PageSpinner label="Loading snapshot..." />
          ) : snapshotRows.length === 0 ? (
            <p className="text-sm text-slate-400">This snapshot contains no metric data.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <Table>
                <THead>
                  <TR>
                    <TH>Metric</TH>
                    <TH className="text-right">Value</TH>
                  </TR>
                </THead>
                <TBody>
                  {snapshotRows.map((row, i) => (
                    <TR key={i}>
                      <TD className="capitalize text-slate-200">{row.label}</TD>
                      <TD className="text-right font-medium tabular-nums text-teal-300">{row.value}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
