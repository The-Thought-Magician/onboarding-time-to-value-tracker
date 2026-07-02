'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  created_at?: string
  updated_at?: string
}
interface Segment { id: string; name: string; color?: string | null }
interface Product { id: string; name: string }

function statusTone(status?: string | null): 'green' | 'amber' | 'slate' | 'teal' {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'published':
      return 'green'
    case 'draft':
      return 'amber'
    case 'archived':
      return 'slate'
    default:
      return 'teal'
  }
}

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [segmentFilter, setSegmentFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    segment_id: '',
    product_id: '',
    total_target_days: '',
    status: 'draft',
  })

  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [t, s, p] = await Promise.all([api.getTemplates(), api.getSegments(), api.getProducts()])
      setTemplates(Array.isArray(t) ? t : [])
      setSegments(Array.isArray(s) ? s : [])
      setProducts(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const segmentName = (id?: string | null) => segments.find((s) => s.id === id)?.name
  const productName = (id?: string | null) => products.find((p) => p.id === id)?.name

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (q && !(`${t.name} ${t.description ?? ''}`.toLowerCase().includes(q))) return false
      if (statusFilter !== 'all' && (t.status || '').toLowerCase() !== statusFilter) return false
      if (segmentFilter !== 'all' && t.segment_id !== segmentFilter) return false
      return true
    })
  }, [templates, search, statusFilter, segmentFilter])

  const stats = useMemo(() => {
    const total = templates.length
    const active = templates.filter((t) => (t.status || '').toLowerCase() === 'active' || (t.status || '').toLowerCase() === 'published').length
    const targets = templates.map((t) => t.total_target_days ?? 0).filter((n) => n > 0)
    const avgTarget = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : 0
    const defaultCount = templates.filter((t) => t.is_default).length
    return { total, active, avgTarget, defaultCount }
  }, [templates])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        segment_id: form.segment_id || undefined,
        product_id: form.product_id || undefined,
        status: form.status,
      }
      if (form.total_target_days.trim()) body.total_target_days = Number(form.total_target_days)
      const created: Template = await api.createTemplate(body)
      setCreateOpen(false)
      setForm({ name: '', description: '', segment_id: '', product_id: '', total_target_days: '', status: 'draft' })
      if (created?.id) router.push(`/dashboard/templates/${created.id}`)
      else load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  async function handleClone(t: Template) {
    setBusyId(t.id)
    try {
      const cloned: Template = await api.cloneTemplate(t.id, { name: `${t.name} (copy)` })
      if (cloned?.id) router.push(`/dashboard/templates/${cloned.id}`)
      else await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clone template')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Archive/delete template "${t.name}"? This cannot be undone.`)) return
    setBusyId(t.id)
    try {
      await api.deleteTemplate(t.id)
      setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading journey templates..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Journey Templates</h1>
          <p className="mt-1 text-sm text-stone-400">
            Reusable onboarding playbooks. Define the milestones every account moves through on its way to first value.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New Template</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Templates" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="teal" />
        <Stat label="Avg target days" value={stats.avgTarget || '—'} tone="green" />
        <Stat label="Default playbooks" value={stats.defaultCount} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="min-w-[200px] flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="all">All segments</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              title={templates.length === 0 ? 'No templates yet' : 'No templates match your filters'}
              description={
                templates.length === 0
                  ? 'Create your first journey template to standardize how accounts reach first value.'
                  : 'Try clearing the search or filters.'
              }
              action={
                templates.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)}>+ New Template</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col rounded-xl border border-stone-800 bg-stone-900/60 p-4 transition-colors hover:border-rose-500/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/templates/${t.id}`}
                      className="text-base font-semibold text-stone-100 hover:text-rose-300"
                    >
                      {t.name}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {t.is_default && <Badge tone="teal">Default</Badge>}
                      <Badge tone={statusTone(t.status)}>{t.status || 'draft'}</Badge>
                    </div>
                  </div>
                  {t.description && <p className="mt-2 line-clamp-2 text-sm text-stone-400">{t.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-400">
                    {t.version != null && <span className="rounded bg-stone-800 px-2 py-0.5">v{t.version}</span>}
                    {t.total_target_days != null && (
                      <span className="rounded bg-stone-800 px-2 py-0.5">{t.total_target_days}d target</span>
                    )}
                    {segmentName(t.segment_id) && (
                      <span className="rounded bg-stone-800 px-2 py-0.5">{segmentName(t.segment_id)}</span>
                    )}
                    {productName(t.product_id) && (
                      <span className="rounded bg-stone-800 px-2 py-0.5">{productName(t.product_id)}</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-stone-800 pt-3">
                    <Link href={`/dashboard/templates/${t.id}`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        Edit milestones
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === t.id}
                      onClick={() => handleClone(t)}
                    >
                      Clone
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === t.id}
                      onClick={() => handleDelete(t)}
                      className="text-rose-300 hover:text-rose-200"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New journey template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="create-template-form" disabled={saving}>
              {saving ? 'Creating...' : 'Create template'}
            </Button>
          </>
        }
      >
        <form id="create-template-form" onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-300">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
              placeholder="Enterprise Onboarding"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-300">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
              placeholder="What this journey covers"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Segment</label>
              <select
                value={form.segment_id}
                onChange={(e) => setForm({ ...form, segment_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Product</label>
              <select
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Total target days</label>
              <input
                type="number"
                min={0}
                value={form.total_target_days}
                onChange={(e) => setForm({ ...form, total_target_days: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                placeholder="30"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
