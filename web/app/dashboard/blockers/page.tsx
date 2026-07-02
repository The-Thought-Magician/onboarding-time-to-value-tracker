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

interface Blocker {
  id: string
  title?: string | null
  description?: string | null
  severity?: string | null
  status?: string | null
  owner?: string | null
  category?: string | null
  category_id?: string | null
  tracker_id?: string | null
  account_name?: string | null
  opened_at?: string | null
  resolved_at?: string | null
  created_at?: string | null
}

interface BlockerCategory {
  id: string
  name?: string | null
  description?: string | null
}

interface FrictionBucket {
  category?: string | null
  stage?: string | null
  name?: string | null
  count?: number | null
  total?: number | null
  avg_days?: number | null
  avgDays?: number | null
  open?: number | null
  resolved?: number | null
}

interface Friction {
  byCategory?: FrictionBucket[]
  byStage?: FrictionBucket[]
}

function str(...vals: Array<string | null | undefined>): string {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v
  return ''
}

function num(...vals: Array<number | null | undefined>): number {
  for (const v of vals) if (typeof v === 'number' && !Number.isNaN(v)) return v
  return 0
}

function sevTone(sev: string): 'red' | 'amber' | 'blue' | 'slate' {
  const s = sev.toLowerCase()
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium') return 'amber'
  if (s === 'low') return 'blue'
  return 'slate'
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

export default function BlockersPage() {
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [categories, setCategories] = useState<BlockerCategory[]>([])
  const [friction, setFriction] = useState<Friction>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [catModal, setCatModal] = useState(false)
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [b, c, f] = await Promise.all([api.getBlockers(), api.getBlockerCategories(), api.getFriction()])
      setBlockers(Array.isArray(b) ? b : [])
      setCategories(Array.isArray(c) ? c : [])
      setFriction((f as Friction) || {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load blockers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function reloadBlockersAndFriction() {
    try {
      const [b, f] = await Promise.all([api.getBlockers(), api.getFriction()])
      setBlockers(Array.isArray(b) ? b : [])
      setFriction((f as Friction) || {})
    } catch {
      // surface via existing error state on next full load
    }
  }

  async function onResolve(id: string) {
    setBusyId(id)
    try {
      await api.resolveBlocker(id)
      await reloadBlockersAndFriction()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve blocker')
    } finally {
      setBusyId(null)
    }
  }

  async function onReopen(id: string) {
    setBusyId(id)
    try {
      await api.reopenBlocker(id)
      await reloadBlockersAndFriction()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen blocker')
    } finally {
      setBusyId(null)
    }
  }

  async function onCreateCategory(e?: React.FormEvent) {
    e?.preventDefault()
    if (!catName.trim()) return
    setCatSaving(true)
    setCatError(null)
    try {
      await api.createBlockerCategory({ name: catName.trim(), description: catDesc.trim() || undefined })
      const c = await api.getBlockerCategories()
      setCategories(Array.isArray(c) ? c : [])
      setCatName('')
      setCatDesc('')
      setCatModal(false)
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setCatSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return blockers.filter((b) => {
      const status = str(b.status).toLowerCase()
      if (statusFilter === 'open' && status === 'resolved') return false
      if (statusFilter === 'resolved' && status !== 'resolved') return false
      if (severityFilter !== 'all' && str(b.severity).toLowerCase() !== severityFilter) return false
      if (categoryFilter !== 'all') {
        const cat = str(b.category_id) || str(b.category)
        if (cat !== categoryFilter && str(b.category) !== categoryFilter) return false
      }
      if (q) {
        const hay = `${str(b.title)} ${str(b.description)} ${str(b.owner)} ${str(b.account_name)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [blockers, statusFilter, severityFilter, categoryFilter, search])

  const stats = useMemo(() => {
    const open = blockers.filter((b) => str(b.status).toLowerCase() !== 'resolved')
    const critical = open.filter((b) => {
      const s = str(b.severity).toLowerCase()
      return s === 'critical' || s === 'high'
    })
    const resolved = blockers.filter((b) => str(b.status).toLowerCase() === 'resolved')
    const ages = open.map((b) => daysSince(b.opened_at || b.created_at)).filter((d): d is number => d !== null)
    const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0
    return { open: open.length, critical: critical.length, resolved: resolved.length, avgAge }
  }, [blockers])

  const catBuckets = useMemo(() => {
    const list = Array.isArray(friction.byCategory) ? friction.byCategory : []
    const mapped = list.map((b) => ({
      label: str(b.category, b.name) || 'Uncategorized',
      count: num(b.count, b.total, b.open),
      avgDays: num(b.avg_days, b.avgDays),
    }))
    const max = Math.max(1, ...mapped.map((m) => m.count))
    return { mapped, max }
  }, [friction])

  const stageBuckets = useMemo(() => {
    const list = Array.isArray(friction.byStage) ? friction.byStage : []
    const mapped = list.map((b) => ({
      label: str(b.stage, b.name) || 'Unknown stage',
      count: num(b.count, b.total, b.open),
      avgDays: num(b.avg_days, b.avgDays),
    }))
    const max = Math.max(1, ...mapped.map((m) => m.count))
    return { mapped, max }
  }, [friction])

  if (loading) return <PageSpinner label="Loading blockers..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Blockers</h1>
          <p className="mt-1 text-sm text-stone-400">
            Track what is slowing onboardings and surface systemic friction patterns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCatModal(true)}>
            New Category
          </Button>
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

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
        <Stat label="Open Blockers" value={stats.open} tone={stats.open > 0 ? 'amber' : 'default'} />
        <Stat label="Critical / High" value={stats.critical} tone={stats.critical > 0 ? 'red' : 'default'} />
        <Stat label="Avg Age (open)" value={stats.avgAge ? `${stats.avgAge}d` : '—'} />
        <Stat label="Resolved" value={stats.resolved} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Friction by Category</h2>
            <p className="mt-1 text-xs text-stone-500">Where blockers cluster across all onboardings.</p>
          </CardHeader>
          <CardBody>
            {catBuckets.mapped.length === 0 ? (
              <EmptyState title="No friction data" description="Blocker volume by category appears once blockers are logged." />
            ) : (
              <div className="space-y-3">
                {catBuckets.mapped.map((b) => (
                  <div key={b.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-300">{b.label}</span>
                      <span className="tabular-nums text-stone-400">
                        {b.count}
                        {b.avgDays ? <span className="text-stone-500"> · {b.avgDays.toFixed(0)}d avg</span> : null}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full rounded-full bg-rose-400"
                        style={{ width: `${Math.max((b.count / catBuckets.max) * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Friction by Stage</h2>
            <p className="mt-1 text-xs text-stone-500">Which journey stages stall most often.</p>
          </CardHeader>
          <CardBody>
            {stageBuckets.mapped.length === 0 ? (
              <EmptyState title="No friction data" description="Blocker volume by stage appears once blockers are logged." />
            ) : (
              <div className="space-y-3">
                {stageBuckets.mapped.map((b) => (
                  <div key={b.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-300">{b.label}</span>
                      <span className="tabular-nums text-stone-400">
                        {b.count}
                        {b.avgDays ? <span className="text-stone-500"> · {b.avgDays.toFixed(0)}d avg</span> : null}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        className="h-full rounded-full bg-sky-400"
                        style={{ width: `${Math.max((b.count / stageBuckets.max) * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-200">Blocker Log</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-1.5 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {str(c.name) || 'Category'}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              title={blockers.length === 0 ? 'No blockers logged' : 'No blockers match these filters'}
              description={
                blockers.length === 0
                  ? 'Blockers raised on trackers will appear here.'
                  : 'Try adjusting the status, severity, or category filters.'
              }
              className="m-4"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Blocker</TH>
                  <TH>Severity</TH>
                  <TH>Category</TH>
                  <TH>Owner</TH>
                  <TH>Account</TH>
                  <TH className="text-right">Age</TH>
                  <TH>Status</TH>
                  <TH className="text-right"></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((b) => {
                  const status = str(b.status).toLowerCase()
                  const resolved = status === 'resolved'
                  const age = resolved ? null : daysSince(b.opened_at || b.created_at)
                  return (
                    <TR key={b.id}>
                      <TD>
                        <div className="font-medium text-stone-100">{str(b.title) || 'Untitled blocker'}</div>
                        {b.description && (
                          <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-stone-500">{b.description}</div>
                        )}
                      </TD>
                      <TD>
                        {b.severity ? (
                          <Badge tone={sevTone(str(b.severity))}>{str(b.severity)}</Badge>
                        ) : (
                          <span className="text-stone-600">—</span>
                        )}
                      </TD>
                      <TD className="text-stone-400">{str(b.category) || '—'}</TD>
                      <TD className="text-stone-400">{str(b.owner) || '—'}</TD>
                      <TD className="text-stone-400">{str(b.account_name) || '—'}</TD>
                      <TD className="text-right tabular-nums">{age !== null ? `${age}d` : '—'}</TD>
                      <TD>
                        <Badge tone={resolved ? 'green' : 'amber'}>{str(b.status) || 'open'}</Badge>
                      </TD>
                      <TD className="text-right">
                        {resolved ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === b.id}
                            onClick={() => onReopen(b.id)}
                          >
                            {busyId === b.id ? '...' : 'Reopen'}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === b.id}
                            onClick={() => onResolve(b.id)}
                          >
                            {busyId === b.id ? '...' : 'Resolve'}
                          </Button>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title="New Blocker Category"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCatModal(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={catSaving || !catName.trim()} onClick={() => onCreateCategory()}>
              {catSaving ? 'Saving...' : 'Create'}
            </Button>
          </>
        }
      >
        <form onSubmit={onCreateCategory} className="space-y-4">
          {catError && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{catError}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Name</label>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Integration / API access"
              autoFocus
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Description</label>
            <textarea
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              rows={3}
              placeholder="Optional — what kinds of blockers belong here"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <button type="submit" className="hidden" aria-hidden />
        </form>
      </Modal>
    </div>
  )
}
