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

interface Segment {
  id: string
  name: string
  color?: string
}
interface Template {
  id: string
  name: string
  version?: number
}
interface SlaPolicy {
  id: string
  name: string
  segment_id?: string | null
  template_id?: string | null
  target_first_value_days: number
  target_go_live_days: number
  grace_days?: number
  active: boolean
  created_at?: string
}
interface Breach {
  tracker_id?: string
  account_id?: string
  account_name?: string
  policy_id?: string
  policy_name?: string
  metric?: string
  target_days?: number
  actual_days?: number
  over_by?: number
  segment_id?: string
}
interface Attainment {
  attainmentPct?: number
  breaches?: Breach[]
  total?: number
  met?: number
}

interface FormState {
  name: string
  segment_id: string
  template_id: string
  target_first_value_days: string
  target_go_live_days: string
  grace_days: string
  active: boolean
}

const emptyForm: FormState = {
  name: '',
  segment_id: '',
  template_id: '',
  target_first_value_days: '14',
  target_go_live_days: '30',
  grace_days: '3',
  active: true,
}

function pctTone(p: number): 'green' | 'amber' | 'red' {
  if (p >= 90) return 'green'
  if (p >= 70) return 'amber'
  return 'red'
}

export default function SlaPage() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  const [attainment, setAttainment] = useState<Attainment | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SlaPolicy | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [pol, att, segs, tmpls] = await Promise.all([
        api.getSlaPolicies(),
        api.getSlaAttainment().catch(() => null),
        api.getSegments().catch(() => []),
        api.getTemplates().catch(() => []),
      ])
      setPolicies(Array.isArray(pol) ? pol : [])
      setAttainment(att ?? null)
      setSegments(Array.isArray(segs) ? segs : [])
      setTemplates(Array.isArray(tmpls) ? tmpls : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SLA data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const segById = useMemo(() => {
    const m = new Map<string, Segment>()
    for (const s of segments) m.set(s.id, s)
    return m
  }, [segments])
  const tmplById = useMemo(() => {
    const m = new Map<string, Template>()
    for (const t of templates) m.set(t.id, t)
    return m
  }, [templates])

  const breaches = attainment?.breaches ?? []
  const attainPct = Math.round(attainment?.attainmentPct ?? 0)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }
  function openEdit(p: SlaPolicy) {
    setEditing(p)
    setForm({
      name: p.name ?? '',
      segment_id: p.segment_id ?? '',
      template_id: p.template_id ?? '',
      target_first_value_days: String(p.target_first_value_days ?? 14),
      target_go_live_days: String(p.target_go_live_days ?? 30),
      grace_days: String(p.grace_days ?? 3),
      active: p.active ?? true,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    const fv = parseInt(form.target_first_value_days, 10)
    const gl = parseInt(form.target_go_live_days, 10)
    const grace = parseInt(form.grace_days, 10)
    if (isNaN(fv) || isNaN(gl)) {
      setFormError('Target days must be valid numbers')
      return
    }
    setBusy(true)
    setFormError(null)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      segment_id: form.segment_id || null,
      template_id: form.template_id || null,
      target_first_value_days: fv,
      target_go_live_days: gl,
      grace_days: isNaN(grace) ? 0 : grace,
      active: form.active,
    }
    try {
      if (editing) await api.updateSlaPolicy(editing.id, payload)
      else await api.createSlaPolicy(payload)
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save policy')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: SlaPolicy) {
    setBusy(true)
    try {
      await api.updateSlaPolicy(p.id, { active: !p.active })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update policy')
    } finally {
      setBusy(false)
    }
  }

  async function removePolicy(p: SlaPolicy) {
    if (!confirm(`Delete SLA policy "${p.name}"?`)) return
    setBusy(true)
    try {
      await api.deleteSlaPolicy(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete policy')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading SLA policies..." />

  const activeCount = policies.filter((p) => p.active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">SLA Policies</h1>
          <p className="mt-1 text-sm text-stone-400">
            Time-to-value commitments and attainment against active onboarding trackers.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Policy</Button>
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
        <Stat label="Policies" value={policies.length} />
        <Stat label="Active" value={activeCount} tone="teal" />
        <Stat label="Attainment" value={`${attainPct}%`} tone={pctTone(attainPct)} />
        <Stat label="Breaches" value={breaches.length} tone={breaches.length > 0 ? 'red' : 'green'} />
      </div>

      {/* Attainment gauge */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">SLA Attainment</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-semibold tabular-nums text-stone-100">{attainPct}%</div>
              <div className="text-xs text-stone-400">
                {typeof attainment?.met === 'number' && typeof attainment?.total === 'number' ? (
                  <span>
                    {attainment.met} of {attainment.total} trackers within SLA
                  </span>
                ) : (
                  <span>of active trackers within SLA</span>
                )}
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="h-3 w-full overflow-hidden rounded-full bg-stone-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    attainPct >= 90 ? 'bg-emerald-500' : attainPct >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, attainPct))}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-stone-500">
                <span>0%</span>
                <span>Target 90%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Policies table */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">Policies</h2>
        </CardHeader>
        {policies.length === 0 ? (
          <CardBody>
            <EmptyState
              icon="⏱"
              title="No SLA policies"
              description="Define target days to first value and go-live for your segments and templates."
              action={<Button onClick={openCreate}>+ New Policy</Button>}
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Scope</TH>
                <TH className="text-right">First Value</TH>
                <TH className="text-right">Go-Live</TH>
                <TH className="text-right">Grace</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {policies.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium text-stone-100">{p.name}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {p.segment_id ? (
                        <Badge tone="blue">{segById.get(p.segment_id)?.name ?? 'Segment'}</Badge>
                      ) : null}
                      {p.template_id ? (
                        <Badge tone="teal">{tmplById.get(p.template_id)?.name ?? 'Template'}</Badge>
                      ) : null}
                      {!p.segment_id && !p.template_id && <span className="text-xs text-stone-500">All</span>}
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">{p.target_first_value_days}d</TD>
                  <TD className="text-right tabular-nums">{p.target_go_live_days}d</TD>
                  <TD className="text-right tabular-nums">{p.grace_days ?? 0}d</TD>
                  <TD>
                    <button onClick={() => toggleActive(p)} disabled={busy} title="Toggle active">
                      <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'Active' : 'Paused'}</Badge>
                    </button>
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removePolicy(p)} disabled={busy}>
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Breaches */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200">SLA Breaches</h2>
            {breaches.length > 0 && <Badge tone="red">{breaches.length}</Badge>}
          </div>
        </CardHeader>
        {breaches.length === 0 ? (
          <CardBody>
            <EmptyState
              icon="✓"
              title="No SLA breaches"
              description="All active trackers are within their SLA targets."
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Account</TH>
                <TH>Policy</TH>
                <TH>Metric</TH>
                <TH className="text-right">Target</TH>
                <TH className="text-right">Actual</TH>
                <TH className="text-right">Over By</TH>
              </TR>
            </THead>
            <TBody>
              {breaches.map((b, i) => {
                const over = b.over_by ?? (b.actual_days != null && b.target_days != null ? b.actual_days - b.target_days : undefined)
                return (
                  <TR key={`${b.tracker_id ?? b.account_id ?? i}-${i}`}>
                    <TD className="font-medium text-stone-100">{b.account_name ?? b.account_id ?? '—'}</TD>
                    <TD>{b.policy_name ?? '—'}</TD>
                    <TD>
                      <Badge tone={b.metric === 'go_live' ? 'amber' : 'blue'}>
                        {b.metric === 'go_live' ? 'Go-Live' : b.metric === 'first_value' ? 'First Value' : b.metric ?? '—'}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{b.target_days != null ? `${b.target_days}d` : '—'}</TD>
                    <TD className="text-right tabular-nums">{b.actual_days != null ? `${b.actual_days}d` : '—'}</TD>
                    <TD className="text-right">
                      {over != null ? <span className="font-medium text-rose-300">+{over}d</span> : '—'}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit SLA Policy' : 'New SLA Policy'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Policy'}
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
            <label className="mb-1 block text-xs font-medium text-stone-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. Enterprise SLA"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Segment (optional)</label>
              <select
                value={form.segment_id}
                onChange={(e) => setForm({ ...form, segment_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">All segments</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Template (optional)</label>
              <select
                value={form.template_id}
                onChange={(e) => setForm({ ...form, template_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">All templates</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">First value (days)</label>
              <input
                type="number"
                min={1}
                value={form.target_first_value_days}
                onChange={(e) => setForm({ ...form, target_first_value_days: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Go-live (days)</label>
              <input
                type="number"
                min={1}
                value={form.target_go_live_days}
                onChange={(e) => setForm({ ...form, target_go_live_days: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Grace (days)</label>
              <input
                type="number"
                min={0}
                value={form.grace_days}
                onChange={(e) => setForm({ ...form, grace_days: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-stone-600 bg-stone-800 text-rose-500 focus:ring-rose-500"
            />
            Active
          </label>
        </div>
      </Modal>
    </div>
  )
}
