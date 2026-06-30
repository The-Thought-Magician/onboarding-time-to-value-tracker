'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import Stat from '@/components/ui/Stat'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/button'
import Modal from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import EmptyState from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'

interface Account {
  id: string
  name?: string
  domain?: string
  segment_id?: string | null
  product_id?: string | null
  plan?: string
  arr_cents?: number
  contract_start?: string | null
  target_go_live?: string | null
  health?: string
  created_at?: string
}

interface Segment {
  id: string
  name?: string
  color?: string
}

const HEALTHS = ['green', 'yellow', 'red'] as const

function fmtMoney(cents?: number): string {
  if (!cents || cents <= 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`
  return `$${dollars.toFixed(0)}`
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function healthTone(h?: string): 'green' | 'amber' | 'red' | 'slate' {
  switch ((h || '').toLowerCase()) {
    case 'green':
    case 'healthy':
      return 'green'
    case 'yellow':
    case 'amber':
    case 'at_risk':
      return 'amber'
    case 'red':
    case 'critical':
      return 'red'
    default:
      return 'slate'
  }
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [segFilter, setSegFilter] = useState('')
  const [healthFilter, setHealthFilter] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const [form, setForm] = useState({
    name: '',
    domain: '',
    segment_id: '',
    plan: '',
    arr: '',
    target_go_live: '',
    health: 'green',
  })

  const segName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of segments) m[s.id] = s.name || 'Segment'
    return m
  }, [segments])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [acc, seg] = await Promise.all([
        api.getAccounts().catch(() => []),
        api.getSegments().catch(() => []),
      ])
      setAccounts(Array.isArray(acc) ? acc : [])
      setSegments(Array.isArray(seg) ? seg : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter((a) => {
      if (segFilter && a.segment_id !== segFilter) return false
      if (healthFilter && (a.health || '').toLowerCase() !== healthFilter) return false
      if (q) {
        const hay = `${a.name || ''} ${a.domain || ''} ${a.plan || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [accounts, search, segFilter, healthFilter])

  const totalArr = useMemo(() => filtered.reduce((s, a) => s + (a.arr_cents || 0), 0), [filtered])
  const atRisk = useMemo(() => filtered.filter((a) => healthTone(a.health) === 'red').length, [filtered])

  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((a) => a.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Account name is required.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        domain: form.domain.trim() || undefined,
        segment_id: form.segment_id || undefined,
        plan: form.plan.trim() || undefined,
        health: form.health || undefined,
        target_go_live: form.target_go_live || undefined,
      }
      const arrNum = parseFloat(form.arr)
      if (!isNaN(arrNum) && arrNum > 0) body.arr_cents = Math.round(arrNum * 100)
      const created = await api.createAccount(body)
      if (created && created.id) {
        setAccounts((prev) => [created, ...prev])
      } else {
        await loadAll()
      }
      setCreateOpen(false)
      setForm({ name: '', domain: '', segment_id: '', plan: '', arr: '', target_go_live: '', health: 'green' })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create account.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account? This cannot be undone.')) return
    setBusyIds((p) => new Set(p).add(id))
    try {
      await api.deleteAccount(id)
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete account.')
    } finally {
      setBusyIds((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} selected account(s)? This cannot be undone.`)) return
    setSaving(true)
    const failed: string[] = []
    await Promise.all(
      ids.map(async (id) => {
        try {
          await api.deleteAccount(id)
        } catch {
          failed.push(id)
        }
      }),
    )
    setAccounts((prev) => prev.filter((a) => !ids.includes(a.id) || failed.includes(a.id)))
    setSelected(new Set(failed))
    if (failed.length) setError(`Failed to delete ${failed.length} account(s).`)
    setSaving(false)
  }

  if (loading) return <PageSpinner label="Loading accounts..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Accounts</h1>
          <p className="mt-1 text-sm text-slate-400">Customer directory and onboarding portfolio.</p>
        </div>
        <Button onClick={() => { setFormError(''); setCreateOpen(true) }}>+ New account</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-rose-300/70 hover:text-rose-200">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Accounts" value={filtered.length} sub={accounts.length !== filtered.length ? `of ${accounts.length} total` : 'in directory'} />
        <Stat label="Portfolio ARR" tone="teal" value={fmtMoney(totalArr)} sub="Across filtered accounts" />
        <Stat label="At risk" tone={atRisk > 0 ? 'red' : 'green'} value={atRisk} sub="Red health" />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, domain, plan..."
            className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
          <select
            value={segFilter}
            onChange={(e) => setSegFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All segments</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All health</option>
            {HEALTHS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {(search || segFilter || healthFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSegFilter(''); setHealthFilter('') }}>Clear</Button>
          )}
        </CardBody>
      </Card>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-2.5 text-sm">
          <span className="text-slate-200">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button>
            <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={saving}>Delete selected</Button>
          </div>
        </div>
      )}

      <Card>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                title={accounts.length === 0 ? 'No accounts yet' : 'No matches'}
                description={accounts.length === 0 ? 'Create your first account to start tracking onboarding.' : 'Try adjusting your filters or search.'}
                action={accounts.length === 0 ? <Button onClick={() => setCreateOpen(true)}>+ New account</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-teal-500" />
                  </TH>
                  <TH>Account</TH>
                  <TH>Segment</TH>
                  <TH>Plan</TH>
                  <TH>ARR</TH>
                  <TH>Target go-live</TH>
                  <TH>Health</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-teal-500" />
                    </TD>
                    <TD className="font-medium text-slate-100">
                      <Link href={`/dashboard/accounts/${a.id}`} className="hover:text-teal-300">{a.name || 'Untitled'}</Link>
                      {a.domain && <div className="text-xs text-slate-500">{a.domain}</div>}
                    </TD>
                    <TD>{a.segment_id ? (segName[a.segment_id] || '—') : '—'}</TD>
                    <TD>{a.plan || '—'}</TD>
                    <TD className="tabular-nums">{fmtMoney(a.arr_cents)}</TD>
                    <TD>{fmtDate(a.target_go_live)}</TD>
                    <TD><Badge tone={healthTone(a.health)}>{a.health || 'n/a'}</Badge></TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/accounts/${a.id}`}><Button variant="ghost" size="sm">View</Button></Link>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)} disabled={busyIds.has(a.id)} className="text-rose-400 hover:text-rose-300">
                          {busyIds.has(a.id) ? '...' : 'Delete'}
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-account-form" disabled={saving}>{saving ? 'Creating...' : 'Create account'}</Button>
          </>
        }
      >
        <form id="create-account-form" onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{formError}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Account name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              placeholder="Acme Corp"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Domain</label>
              <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none" placeholder="acme.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Plan</label>
              <input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none" placeholder="Enterprise" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Segment</label>
              <select value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none">
                <option value="">None</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Health</label>
              <select value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none">
                {HEALTHS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">ARR (USD)</label>
              <input value={form.arr} onChange={(e) => setForm({ ...form, arr: e.target.value })} type="number" min="0" step="0.01" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none" placeholder="50000" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Target go-live</label>
              <input value={form.target_go_live} onChange={(e) => setForm({ ...form, target_go_live: e.target.value })} type="date" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-teal-500 focus:outline-none" />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
