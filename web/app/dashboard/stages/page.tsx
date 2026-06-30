'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Stage {
  id: string
  name: string
  category?: string | null
  default_target_days?: number | null
  owner_role?: string | null
  weight?: number | null
  checklist?: string[] | null
  created_at?: string
}

const CATEGORIES = ['kickoff', 'setup', 'integration', 'training', 'adoption', 'first_value', 'go_live', 'expansion', 'other']
const OWNER_ROLES = ['csm', 'onboarding', 'implementation', 'support', 'sales', 'customer', 'product']

const CATEGORY_TONE: Record<string, 'teal' | 'green' | 'amber' | 'blue' | 'slate'> = {
  kickoff: 'blue',
  setup: 'slate',
  integration: 'amber',
  training: 'blue',
  adoption: 'teal',
  first_value: 'green',
  go_live: 'green',
  expansion: 'teal',
  other: 'slate',
}

interface StageForm {
  name: string
  category: string
  default_target_days: string
  owner_role: string
  weight: string
  checklist: string
}

const EMPTY_FORM: StageForm = {
  name: '',
  category: 'setup',
  default_target_days: '5',
  owner_role: 'csm',
  weight: '1',
  checklist: '',
}

function toForm(s: Stage): StageForm {
  return {
    name: s.name ?? '',
    category: s.category ?? 'other',
    default_target_days: s.default_target_days != null ? String(s.default_target_days) : '',
    owner_role: s.owner_role ?? '',
    weight: s.weight != null ? String(s.weight) : '1',
    checklist: Array.isArray(s.checklist) ? s.checklist.join('\n') : '',
  }
}

function fromForm(f: StageForm) {
  const checklist = f.checklist
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    name: f.name.trim(),
    category: f.category || null,
    default_target_days: f.default_target_days === '' ? null : Number(f.default_target_days),
    owner_role: f.owner_role || null,
    weight: f.weight === '' ? null : Number(f.weight),
    checklist,
  }
}

export default function StagesPage() {
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Stage | null>(null)
  const [form, setForm] = useState<StageForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getStages()
      setStages(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return stages.filter((s) => {
      if (categoryFilter && (s.category ?? '') !== categoryFilter) return false
      if (q) {
        const hay = `${s.name} ${s.category ?? ''} ${s.owner_role ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [stages, query, categoryFilter])

  const totalTargetDays = useMemo(
    () => stages.reduce((acc, s) => acc + (s.default_target_days ?? 0), 0),
    [stages]
  )
  const categoryCount = useMemo(() => new Set(stages.map((s) => s.category ?? 'other')).size, [stages])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (s: Stage) => {
    setEditing(s)
    setForm(toForm(s))
    setFormError(null)
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const body = fromForm(form)
      if (editing) {
        await api.updateStage(editing.id, body)
      } else {
        await api.createStage(body)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save stage')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Stage) => {
    if (!confirm(`Delete stage "${s.name}"? This cannot be undone.`)) return
    setDeletingId(s.id)
    try {
      await api.deleteStage(s.id)
      setStages((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete stage')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading stage library..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Stage Library</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reusable onboarding stages with target durations, owners, and checklists. Drop these into journey templates.
          </p>
        </div>
        <Button onClick={openCreate}>+ New stage</Button>
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
        <Stat label="Stages" value={stages.length} tone="teal" />
        <Stat label="Categories used" value={categoryCount} />
        <Stat label="Combined target" value={`${totalTargetDays}d`} sub="Sum of default target days" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stages..."
              className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            {filtered.length} of {stages.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {stages.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No stages yet"
                description="Create your first onboarding stage to start building journey templates."
                action={<Button onClick={openCreate}>+ New stage</Button>}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No matching stages" description="Try a different search or category filter." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Stage</TH>
                  <TH>Category</TH>
                  <TH>Owner</TH>
                  <TH className="text-right">Target</TH>
                  <TH className="text-right">Weight</TH>
                  <TH>Checklist</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium text-slate-100">{s.name}</TD>
                    <TD>
                      {s.category ? (
                        <Badge tone={CATEGORY_TONE[s.category] ?? 'slate'}>{s.category.replace(/_/g, ' ')}</Badge>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD>{s.owner_role ? s.owner_role.replace(/_/g, ' ') : <span className="text-slate-600">—</span>}</TD>
                    <TD className="text-right tabular-nums">{s.default_target_days != null ? `${s.default_target_days}d` : '—'}</TD>
                    <TD className="text-right tabular-nums">{s.weight ?? '—'}</TD>
                    <TD>
                      {Array.isArray(s.checklist) && s.checklist.length > 0 ? (
                        <span className="text-slate-400">{s.checklist.length} items</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(s)} disabled={deletingId === s.id}>
                          {deletingId === s.id ? '…' : 'Delete'}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit stage' : 'New stage'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create stage'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Technical Integration"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Owner role</label>
              <select
                value={form.owner_role}
                onChange={(e) => setForm({ ...form, owner_role: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {OWNER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Default target (days)</label>
              <input
                type="number"
                min={0}
                value={form.default_target_days}
                onChange={(e) => setForm({ ...form, default_target_days: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Weight</label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Checklist (one item per line)</label>
            <textarea
              value={form.checklist}
              onChange={(e) => setForm({ ...form, checklist: e.target.value })}
              rows={4}
              placeholder={'Confirm data access\nSet up SSO\nValidate first import'}
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
