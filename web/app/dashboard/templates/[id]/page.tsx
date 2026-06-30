'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

interface Template {
  id: string
  name: string
  description?: string | null
  segment_id?: string | null
  product_id?: string | null
  version?: number | null
  status?: string | null
  total_target_days?: number | null
  is_default?: boolean | null
}
interface TemplateMilestone {
  id: string
  template_id: string
  stage_id?: string | null
  name: string
  description?: string | null
  category?: string | null
  position: number
  target_days?: number | null
  owner_role?: string | null
  weight?: number | null
  is_first_value?: boolean | null
  is_go_live?: boolean | null
  exit_criteria?: string | null
}
interface Stage {
  id: string
  name: string
  category?: string | null
  default_target_days?: number | null
  owner_role?: string | null
  weight?: number | null
}

type MilestoneForm = {
  stage_id: string
  name: string
  description: string
  category: string
  target_days: string
  owner_role: string
  weight: string
  is_first_value: boolean
  is_go_live: boolean
  exit_criteria: string
}

const emptyForm: MilestoneForm = {
  stage_id: '',
  name: '',
  description: '',
  category: '',
  target_days: '',
  owner_role: '',
  weight: '',
  is_first_value: false,
  is_go_live: false,
  exit_criteria: '',
}

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [template, setTemplate] = useState<Template | null>(null)
  const [milestones, setMilestones] = useState<TemplateMilestone[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // template metadata edit
  const [editMeta, setEditMeta] = useState(false)
  const [meta, setMeta] = useState({ name: '', description: '', status: 'draft', total_target_days: '' })
  const [metaError, setMetaError] = useState('')

  // milestone modal
  const [msOpen, setMsOpen] = useState(false)
  const [editingMs, setEditingMs] = useState<TemplateMilestone | null>(null)
  const [form, setForm] = useState<MilestoneForm>(emptyForm)
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [tpl, st] = await Promise.all([api.getTemplate(id), api.getStages()])
      // getTemplate returns { template, milestones }
      const t: Template = tpl?.template ?? tpl
      const ms: TemplateMilestone[] = tpl?.milestones ?? []
      setTemplate(t)
      setMilestones([...ms].sort((a, b) => a.position - b.position))
      setStages(Array.isArray(st) ? st : [])
      if (t) {
        setMeta({
          name: t.name ?? '',
          description: t.description ?? '',
          status: t.status ?? 'draft',
          total_target_days: t.total_target_days != null ? String(t.total_target_days) : '',
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load template')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const totalTargetDays = useMemo(
    () => milestones.reduce((acc, m) => acc + (m.target_days ?? 0), 0),
    [milestones],
  )
  const totalWeight = useMemo(
    () => milestones.reduce((acc, m) => acc + (m.weight ?? 0), 0),
    [milestones],
  )

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault()
    setMetaError('')
    if (!meta.name.trim()) {
      setMetaError('Name is required')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        name: meta.name.trim(),
        description: meta.description.trim() || null,
        status: meta.status,
      }
      if (meta.total_target_days.trim()) body.total_target_days = Number(meta.total_target_days)
      const updated: Template = await api.updateTemplate(id, body)
      setTemplate(updated?.id ? updated : { ...(template as Template), ...body } as Template)
      setEditMeta(false)
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : 'Failed to update template')
    } finally {
      setBusy(false)
    }
  }

  function openCreate() {
    setEditingMs(null)
    setForm(emptyForm)
    setFormError('')
    setMsOpen(true)
  }

  function openEdit(m: TemplateMilestone) {
    setEditingMs(m)
    setForm({
      stage_id: m.stage_id ?? '',
      name: m.name ?? '',
      description: m.description ?? '',
      category: m.category ?? '',
      target_days: m.target_days != null ? String(m.target_days) : '',
      owner_role: m.owner_role ?? '',
      weight: m.weight != null ? String(m.weight) : '',
      is_first_value: !!m.is_first_value,
      is_go_live: !!m.is_go_live,
      exit_criteria: m.exit_criteria ?? '',
    })
    setFormError('')
    setMsOpen(true)
  }

  function applyStage(stageId: string) {
    const s = stages.find((x) => x.id === stageId)
    setForm((prev) => ({
      ...prev,
      stage_id: stageId,
      name: prev.name || s?.name || '',
      category: prev.category || s?.category || '',
      target_days: prev.target_days || (s?.default_target_days != null ? String(s.default_target_days) : ''),
      owner_role: prev.owner_role || s?.owner_role || '',
      weight: prev.weight || (s?.weight != null ? String(s.weight) : ''),
    }))
  }

  async function saveMilestone(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Milestone name is required')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        stage_id: form.stage_id || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        owner_role: form.owner_role.trim() || null,
        exit_criteria: form.exit_criteria.trim() || null,
        is_first_value: form.is_first_value,
        is_go_live: form.is_go_live,
      }
      body.target_days = form.target_days.trim() ? Number(form.target_days) : null
      body.weight = form.weight.trim() ? Number(form.weight) : null

      if (editingMs) {
        const updated: TemplateMilestone = await api.updateTemplateMilestone(id, editingMs.id, body)
        setMilestones((prev) =>
          prev
            .map((m) => (m.id === editingMs.id ? { ...m, ...body, ...updated } : m))
            .sort((a, b) => a.position - b.position),
        )
      } else {
        body.position = milestones.length
        const created: TemplateMilestone = await api.addTemplateMilestone(id, body)
        setMilestones((prev) => [...prev, created].sort((a, b) => a.position - b.position))
      }
      setMsOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save milestone')
    } finally {
      setBusy(false)
    }
  }

  async function deleteMilestone(m: TemplateMilestone) {
    if (!confirm(`Delete milestone "${m.name}"?`)) return
    setBusy(true)
    try {
      await api.deleteTemplateMilestone(id, m.id)
      setMilestones((prev) => prev.filter((x) => x.id !== m.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete milestone')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= milestones.length) return
    const next = [...milestones]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    const reindexed = next.map((m, i) => ({ ...m, position: i }))
    setMilestones(reindexed)
    setBusy(true)
    try {
      await api.reorderTemplateMilestones(id, { order: reindexed.map((m) => m.id) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder')
      load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading template..." />

  if (error && !template) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/templates" className="text-sm text-teal-400 hover:text-teal-300">
          ← Back to templates
        </Link>
        <EmptyState title="Could not load template" description={error} />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/templates" className="text-sm text-teal-400 hover:text-teal-300">
          ← Back to templates
        </Link>
        <EmptyState title="Template not found" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/templates" className="text-sm text-teal-400 hover:text-teal-300">
          ← Back to templates
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">{template.name}</h1>
            {template.is_default && <Badge tone="teal">Default</Badge>}
            <Badge tone={template.status === 'active' ? 'green' : 'slate'}>{template.status || 'draft'}</Badge>
            {template.version != null && <Badge tone="blue">v{template.version}</Badge>}
          </div>
          {template.description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{template.description}</p>}
        </div>
        <Button variant="secondary" onClick={() => setEditMeta(true)}>
          Edit template
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Milestones" value={milestones.length} />
        <Stat label="Milestone target days" value={totalTargetDays || '—'} tone="teal" />
        <Stat label="Declared target days" value={template.total_target_days ?? '—'} />
        <Stat label="Total weight" value={totalWeight || '—'} tone="green" />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Milestones</h2>
            <p className="text-xs text-slate-500">Ordered stages an account moves through. Use the arrows to reorder.</p>
          </div>
          <Button onClick={openCreate}>+ Add milestone</Button>
        </CardHeader>
        <CardBody>
          {milestones.length === 0 ? (
            <EmptyState
              title="No milestones yet"
              description="Add milestones to define the path from kickoff to go-live."
              action={<Button onClick={openCreate}>+ Add milestone</Button>}
            />
          ) : (
            <ol className="space-y-3">
              {milestones.map((m, i) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || busy}
                      className="text-slate-500 hover:text-teal-300 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-teal-300">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === milestones.length - 1 || busy}
                      className="text-slate-500 hover:text-teal-300 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-100">{m.name}</span>
                      {m.is_first_value && <Badge tone="teal">First value</Badge>}
                      {m.is_go_live && <Badge tone="green">Go-live</Badge>}
                      {m.category && <Badge tone="slate">{m.category}</Badge>}
                    </div>
                    {m.description && <p className="mt-1 text-sm text-slate-400">{m.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                      {m.target_days != null && (
                        <span className="rounded bg-slate-800 px-2 py-0.5">{m.target_days}d target</span>
                      )}
                      {m.weight != null && <span className="rounded bg-slate-800 px-2 py-0.5">weight {m.weight}</span>}
                      {m.owner_role && <span className="rounded bg-slate-800 px-2 py-0.5">{m.owner_role}</span>}
                    </div>
                    {m.exit_criteria && (
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-400">Exit criteria:</span> {m.exit_criteria}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(m)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMilestone(m)}
                      className="text-rose-300 hover:text-rose-200"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* Template metadata modal */}
      <Modal
        open={editMeta}
        onClose={() => setEditMeta(false)}
        title="Edit template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditMeta(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="meta-form" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <form id="meta-form" onSubmit={saveMeta} className="space-y-4">
          {metaError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">
              {metaError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
            <input
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              value={meta.description}
              onChange={(e) => setMeta({ ...meta, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Total target days</label>
              <input
                type="number"
                min={0}
                value={meta.total_target_days}
                onChange={(e) => setMeta({ ...meta, total_target_days: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Status</label>
              <select
                value={meta.status}
                onChange={(e) => setMeta({ ...meta, status: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Milestone modal */}
      <Modal
        open={msOpen}
        onClose={() => setMsOpen(false)}
        title={editingMs ? 'Edit milestone' : 'Add milestone'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMsOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="ms-form" disabled={busy}>
              {busy ? 'Saving...' : editingMs ? 'Save milestone' : 'Add milestone'}
            </Button>
          </>
        }
      >
        <form id="ms-form" onSubmit={saveMilestone} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">
              {formError}
            </div>
          )}
          {stages.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Stage (from library)</label>
              <select
                value={form.stage_id}
                onChange={(e) => applyStage(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              >
                <option value="">— Custom (no stage) —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              placeholder="Kickoff call"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Category</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                placeholder="Implementation"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Owner role</label>
              <input
                value={form.owner_role}
                onChange={(e) => setForm({ ...form, owner_role: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                placeholder="CSM"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Target days</label>
              <input
                type="number"
                min={0}
                value={form.target_days}
                onChange={(e) => setForm({ ...form, target_days: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                placeholder="5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Weight</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
                placeholder="1"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Exit criteria</label>
            <textarea
              value={form.exit_criteria}
              onChange={(e) => setForm({ ...form, exit_criteria: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              placeholder="What must be true to mark this complete"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.is_first_value}
                onChange={(e) => setForm({ ...form, is_first_value: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
              />
              First-value milestone
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.is_go_live}
                onChange={(e) => setForm({ ...form, is_go_live: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
              />
              Go-live milestone
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
