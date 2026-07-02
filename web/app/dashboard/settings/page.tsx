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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Workspace {
  id: string
  name?: string | null
  default_segment_id?: string | null
  default_template_id?: string | null
  business_days_only?: boolean | null
  default_stall_days?: number | null
  settings?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

interface Segment {
  id: string
  name: string
  description?: string | null
  color?: string | null
  created_at?: string
}

interface Product {
  id: string
  name: string
  description?: string | null
  created_at?: string
}

interface SavedView {
  id: string
  name: string
  kind?: string | null
  filters?: Record<string, unknown> | null
  pinned?: boolean | null
  created_at?: string
}

interface Plan {
  id?: string
  name?: string | null
  price_cents?: number | null
}

interface Subscription {
  id?: string
  status?: string | null
  plan_id?: string | null
  current_period_end?: string | null
}

interface BillingPlan {
  subscription?: Subscription | null
  plan?: Plan | null
  stripeEnabled?: boolean
}

type Tab = 'workspace' | 'segments' | 'products' | 'views' | 'billing'

const TABS: { id: Tab; label: string }[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'segments', label: 'Segments' },
  { id: 'products', label: 'Products' },
  { id: 'views', label: 'Saved Views' },
  { id: 'billing', label: 'Billing' },
]

const SEGMENT_COLORS = ['teal', 'blue', 'green', 'amber', 'red', 'slate'] as const

function colorToTone(color?: string | null): 'teal' | 'blue' | 'green' | 'amber' | 'red' | 'slate' {
  const c = (color ?? '').toLowerCase()
  if (c === 'teal' || c === 'blue' || c === 'green' || c === 'amber' || c === 'red' || c === 'slate') return c
  return 'slate'
}

function fmtPrice(cents?: number | null): string {
  if (cents == null) return '—'
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('workspace')

  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [views, setViews] = useState<SavedView[]>([])
  const [billing, setBilling] = useState<BillingPlan | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ws, segs, prods, vs, bill] = await Promise.all([
        api.getWorkspace(),
        api.getSegments(),
        api.getProducts(),
        api.getViews(),
        api.getBillingPlan(),
      ])
      setWorkspace(ws ?? null)
      setSegments(Array.isArray(segs) ? segs : [])
      setProducts(Array.isArray(prods) ? prods : [])
      setViews(Array.isArray(vs) ? vs : [])
      setBilling(bill ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageSpinner label="Loading settings..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-100">Settings</h1>
        <p className="mt-1 text-sm text-stone-400">
          Configure your workspace, manage segments and products, organize saved views, and review your plan.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button onClick={load} className="font-medium text-rose-200 underline hover:text-rose-100">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Segments" value={segments.length} tone="teal" />
        <Stat label="Products" value={products.length} />
        <Stat label="Saved views" value={views.length} />
        <Stat
          label="Plan"
          value={billing?.plan?.name ? billing.plan.name : '—'}
          tone={billing?.subscription?.status === 'active' ? 'green' : 'default'}
          sub={billing?.subscription?.status ?? 'No subscription'}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-rose-400 text-rose-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'workspace' && (
        <WorkspaceTab
          workspace={workspace}
          segments={segments}
          onSaved={(ws) => setWorkspace(ws)}
          onError={setError}
        />
      )}
      {tab === 'segments' && (
        <SegmentsTab segments={segments} setSegments={setSegments} onError={setError} />
      )}
      {tab === 'products' && (
        <ProductsTab products={products} setProducts={setProducts} onError={setError} />
      )}
      {tab === 'views' && <ViewsTab views={views} setViews={setViews} onError={setError} />}
      {tab === 'billing' && <BillingTab billing={billing} onError={setError} reload={load} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Workspace tab
// ---------------------------------------------------------------------------

function WorkspaceTab({
  workspace,
  segments,
  onSaved,
  onError,
}: {
  workspace: Workspace | null
  segments: Segment[]
  onSaved: (ws: Workspace) => void
  onError: (msg: string | null) => void
}) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [defaultSegmentId, setDefaultSegmentId] = useState(workspace?.default_segment_id ?? '')
  const [businessDaysOnly, setBusinessDaysOnly] = useState(Boolean(workspace?.business_days_only))
  const [defaultStallDays, setDefaultStallDays] = useState(
    workspace?.default_stall_days != null ? String(workspace.default_stall_days) : '14'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(workspace?.name ?? '')
    setDefaultSegmentId(workspace?.default_segment_id ?? '')
    setBusinessDaysOnly(Boolean(workspace?.business_days_only))
    setDefaultStallDays(workspace?.default_stall_days != null ? String(workspace.default_stall_days) : '14')
  }, [workspace])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    onError(null)
    try {
      const body = {
        name: name.trim(),
        default_segment_id: defaultSegmentId || null,
        business_days_only: businessDaysOnly,
        default_stall_days: defaultStallDays === '' ? null : Number(defaultStallDays),
      }
      const ws = await api.updateWorkspace(body)
      onSaved(ws ?? null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update workspace')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-stone-100">Workspace</h2>
        <p className="mt-1 text-sm text-stone-400">
          Defaults applied across trackers, stall detection, and reporting.
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-400">Workspace name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Customer Success"
            className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Default segment</label>
            <select
              value={defaultSegmentId ?? ''}
              onChange={(e) => setDefaultSegmentId(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="">No default</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">Pre-selected when creating new accounts.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Default stall threshold (days)</label>
            <input
              type="number"
              min={1}
              value={defaultStallDays}
              onChange={(e) => setDefaultStallDays(e.target.value)}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-stone-500">Days of inactivity before a tracker is flagged as stalled.</p>
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={businessDaysOnly}
            onChange={(e) => setBusinessDaysOnly(e.target.checked)}
            className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-rose-500 focus:ring-rose-500/60"
          />
          <span>
            Business days only
            <span className="ml-2 text-xs text-stone-500">Exclude weekends from TTV and target-day calculations.</span>
          </span>
        </label>

        <div className="flex items-center gap-3 border-t border-stone-800 pt-4">
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && <span className="text-sm text-emerald-300">Saved</span>}
          {workspace?.id && (
            <span className="ml-auto text-xs text-stone-500">
              Created {fmtDate(workspace.created_at)}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Segments tab
// ---------------------------------------------------------------------------

interface SegmentForm {
  name: string
  description: string
  color: string
}

const EMPTY_SEGMENT: SegmentForm = { name: '', description: '', color: 'teal' }

function SegmentsTab({
  segments,
  setSegments,
  onError,
}: {
  segments: Segment[]
  setSegments: (fn: (prev: Segment[]) => Segment[]) => void
  onError: (msg: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Segment | null>(null)
  const [form, setForm] = useState<SegmentForm>(EMPTY_SEGMENT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return segments
    return segments.filter((s) =>
      `${s.name} ${s.description ?? ''}`.toLowerCase().includes(q)
    )
  }, [segments, query])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_SEGMENT)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (s: Segment) => {
    setEditing(s)
    setForm({ name: s.name ?? '', description: s.description ?? '', color: s.color ?? 'teal' })
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
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color || null,
      }
      if (editing) {
        const updated = await api.updateSegment(editing.id, body)
        setSegments((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...(updated ?? body) } : x)))
      } else {
        const created = await api.createSegment(body)
        if (created) setSegments((prev) => [...prev, created])
      }
      setModalOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save segment')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: Segment) => {
    if (!confirm(`Delete segment "${s.name}"? Accounts using it will be unassigned.`)) return
    setDeletingId(s.id)
    onError(null)
    try {
      await api.deleteSegment(s.id)
      setSegments((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete segment')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-100">Segments</h2>
          <p className="mt-1 text-sm text-stone-400">Group accounts by tier, region, or motion for filtering and SLAs.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search segments..."
            className="w-48 rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />
          <Button onClick={openCreate}>+ New segment</Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {segments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No segments yet"
              description="Create segments like Enterprise, Mid-Market, or SMB to slice your onboarding metrics."
              action={<Button onClick={openCreate}>+ New segment</Button>}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No matching segments" description="Try a different search." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Segment</TH>
                <TH>Description</TH>
                <TH>Color</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium text-stone-100">{s.name}</TD>
                  <TD className="max-w-md truncate">
                    {s.description ? s.description : <span className="text-stone-600">—</span>}
                  </TD>
                  <TD>
                    <Badge tone={colorToTone(s.color)}>{s.color ?? 'slate'}</Badge>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit segment' : 'New segment'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create segment'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Enterprise"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Optional notes about this segment"
              className="w-full resize-y rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Color</label>
            <div className="flex flex-wrap gap-2">
              {SEGMENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`rounded-full border px-1 py-1 ${form.color === c ? 'ring-2 ring-rose-400' : ''}`}
                  aria-label={c}
                >
                  <Badge tone={c}>{c}</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Products tab
// ---------------------------------------------------------------------------

interface ProductForm {
  name: string
  description: string
}

const EMPTY_PRODUCT: ProductForm = { name: '', description: '' }

function ProductsTab({
  products,
  setProducts,
  onError,
}: {
  products: Product[]
  setProducts: (fn: (prev: Product[]) => Product[]) => void
  onError: (msg: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q))
  }, [products, query])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_PRODUCT)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({ name: p.name ?? '', description: p.description ?? '' })
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
      const body = { name: form.name.trim(), description: form.description.trim() || null }
      if (editing) {
        const updated = await api.updateProduct(editing.id, body)
        setProducts((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...(updated ?? body) } : x)))
      } else {
        const created = await api.createProduct(body)
        if (created) setProducts((prev) => [...prev, created])
      }
      setModalOpen(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: Product) => {
    if (!confirm(`Delete product "${p.name}"?`)) return
    setDeletingId(p.id)
    onError(null)
    try {
      await api.deleteProduct(p.id)
      setProducts((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete product')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-100">Products</h2>
          <p className="mt-1 text-sm text-stone-400">The products customers onboard onto. Templates and accounts can target a product.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-48 rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />
          <Button onClick={openCreate}>+ New product</Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No products yet"
              description="Add the products your customers onboard onto."
              action={<Button onClick={openCreate}>+ New product</Button>}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No matching products" description="Try a different search." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Description</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium text-stone-100">{p.name}</TD>
                  <TD className="max-w-md truncate">
                    {p.description ? p.description : <span className="text-stone-600">—</span>}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p)} disabled={deletingId === p.id}>
                        {deletingId === p.id ? '…' : 'Delete'}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit product' : 'New product'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Analytics Cloud"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Optional"
              className="w-full resize-y rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Saved views tab
// ---------------------------------------------------------------------------

function ViewsTab({
  views,
  setViews,
  onError,
}: {
  views: SavedView[]
  setViews: (fn: (prev: SavedView[]) => SavedView[]) => void
  onError: (msg: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [editing, setEditing] = useState<SavedView | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const kinds = useMemo(
    () => Array.from(new Set(views.map((v) => v.kind ?? '').filter(Boolean))).sort(),
    [views]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return views.filter((v) => {
      if (kindFilter && (v.kind ?? '') !== kindFilter) return false
      if (q && !v.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [views, query, kindFilter])

  const togglePin = async (v: SavedView) => {
    setBusyId(v.id)
    onError(null)
    try {
      const updated = await api.updateView(v.id, { pinned: !v.pinned })
      setViews((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...(updated ?? { pinned: !v.pinned }) } : x)))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to update view')
    } finally {
      setBusyId(null)
    }
  }

  const openRename = (v: SavedView) => {
    setEditing(v)
    setEditName(v.name)
  }

  const saveRename = async () => {
    if (!editing || !editName.trim()) return
    setSaving(true)
    onError(null)
    try {
      const updated = await api.updateView(editing.id, { name: editName.trim() })
      setViews((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...(updated ?? { name: editName.trim() }) } : x)))
      setEditing(null)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to rename view')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (v: SavedView) => {
    if (!confirm(`Delete saved view "${v.name}"?`)) return
    setBusyId(v.id)
    onError(null)
    try {
      await api.deleteView(v.id)
      setViews((prev) => prev.filter((x) => x.id !== v.id))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete view')
    } finally {
      setBusyId(null)
    }
  }

  const filterCount = (f?: Record<string, unknown> | null) =>
    f && typeof f === 'object' ? Object.keys(f).length : 0

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-100">Saved Views</h2>
          <p className="mt-1 text-sm text-stone-400">
            Saved filter sets and cohorts. Pin the ones you use most so they surface first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search views..."
            className="w-48 rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />
          {kinds.length > 0 && (
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="">All kinds</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {views.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No saved views yet"
              description="Saved views are created from the Trackers and Analytics pages. They'll show up here for management."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No matching views" description="Try a different search or kind filter." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>View</TH>
                <TH>Kind</TH>
                <TH className="text-right">Filters</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((v) => (
                <TR key={v.id}>
                  <TD className="font-medium text-stone-100">
                    <span className="flex items-center gap-2">
                      {v.pinned && <span title="Pinned" className="text-rose-400">★</span>}
                      {v.name}
                    </span>
                  </TD>
                  <TD>{v.kind ? <Badge tone="blue">{v.kind}</Badge> : <span className="text-stone-600">—</span>}</TD>
                  <TD className="text-right tabular-nums">{filterCount(v.filters)}</TD>
                  <TD>{fmtDate(v.created_at)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => togglePin(v)} disabled={busyId === v.id}>
                        {v.pinned ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openRename(v)}>
                        Rename
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(v)} disabled={busyId === v.id}>
                        {busyId === v.id ? '…' : 'Delete'}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title="Rename view"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveRename} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-400">Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          />
        </div>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Billing tab
// ---------------------------------------------------------------------------

function BillingTab({
  billing,
  onError,
  reload,
}: {
  billing: BillingPlan | null
  onError: (msg: string | null) => void
  reload: () => void
}) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sub = billing?.subscription ?? null
  const plan = billing?.plan ?? null
  const stripeEnabled = Boolean(billing?.stripeEnabled)
  const isActive = sub?.status === 'active' || sub?.status === 'trialing'

  const statusTone = (s?: string | null): 'green' | 'amber' | 'red' | 'slate' => {
    if (s === 'active' || s === 'trialing') return 'green'
    if (s === 'past_due' || s === 'incomplete') return 'amber'
    if (s === 'canceled' || s === 'unpaid') return 'red'
    return 'slate'
  }

  const checkout = async () => {
    setBusy('checkout')
    setNotice(null)
    onError(null)
    try {
      const res = await api.startCheckout({})
      if (res?.url) {
        window.location.href = res.url
      } else {
        setNotice('Checkout is not available right now.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start checkout'
      if (/503|unavailable|not configured|stripe/i.test(msg)) {
        setNotice('Billing is not configured on this instance. All features are free.')
      } else {
        onError(msg)
      }
    } finally {
      setBusy(null)
    }
  }

  const portal = async () => {
    setBusy('portal')
    setNotice(null)
    onError(null)
    try {
      const res = await api.openPortal({})
      if (res?.url) {
        window.location.href = res.url
      } else {
        setNotice('Billing portal is not available right now.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to open billing portal'
      if (/503|unavailable|not configured|stripe/i.test(msg)) {
        setNotice('Billing is not configured on this instance. All features are free.')
      } else {
        onError(msg)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-stone-100">Current plan</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-semibold text-stone-100">{plan?.name ?? 'Free'}</div>
                <div className="mt-1 text-sm text-stone-400">{fmtPrice(plan?.price_cents)}</div>
              </div>
              <Badge tone={statusTone(sub?.status)}>{sub?.status ?? 'no subscription'}</Badge>
            </div>

            <dl className="space-y-2 border-t border-stone-800 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-400">Subscription status</dt>
                <dd className="text-stone-200">{sub?.status ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-400">Renews / expires</dt>
                <dd className="text-stone-200">{fmtDate(sub?.current_period_end)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-400">Stripe billing</dt>
                <dd>
                  {stripeEnabled ? (
                    <Badge tone="green">Enabled</Badge>
                  ) : (
                    <Badge tone="slate">Disabled</Badge>
                  )}
                </dd>
              </div>
            </dl>

            {notice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {notice}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-stone-800 pt-4">
              {!isActive && (
                <Button onClick={checkout} disabled={busy != null}>
                  {busy === 'checkout' ? 'Redirecting…' : 'Upgrade to Pro'}
                </Button>
              )}
              <Button variant="secondary" onClick={portal} disabled={busy != null}>
                {busy === 'portal' ? 'Opening…' : 'Manage billing'}
              </Button>
              <Button variant="ghost" onClick={reload} disabled={busy != null}>
                Refresh
              </Button>
            </div>
            {!stripeEnabled && (
              <p className="text-xs text-stone-500">
                Stripe is optional on this instance. When it is not configured, every feature is available for free.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-stone-100">What is included</h2>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2 text-sm text-stone-300">
              {[
                'Unlimited onboarding trackers and accounts',
                'Journey templates with milestone editor',
                'Stall detection and ARR-at-risk bands',
                'TTV analytics, cohorts, and stage funnel',
                'Manager scorecards and team capacity',
                'SLA policies, risk triage, and alerts',
                'CSV imports and shareable customer plans',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-rose-400">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
