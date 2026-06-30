'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

type Tone = 'default' | 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'slate'

interface Account {
  id: string
  name: string
  domain?: string | null
  segment_id?: string | null
  product_id?: string | null
  plan?: string | null
  arr_cents?: number | null
  contract_start?: string | null
  target_go_live?: string | null
  cs_owner_id?: string | null
  health?: string | null
  created_at?: string
  updated_at?: string
}

interface Tracker {
  id: string
  account_id: string
  status?: string | null
  progress_pct?: number | null
  risk_score?: number | null
  started_at?: string | null
  first_value_at?: string | null
  go_live_at?: string | null
  projected_go_live?: string | null
  current_milestone_id?: string | null
  last_activity_at?: string | null
}

interface Activity {
  id: string
  type?: string | null
  actor?: string | null
  message?: string | null
  created_at?: string
}

function healthTone(h?: string | null): Tone {
  switch ((h || '').toLowerCase()) {
    case 'green':
    case 'healthy':
      return 'green'
    case 'yellow':
    case 'at_risk':
    case 'at-risk':
      return 'amber'
    case 'red':
    case 'critical':
      return 'red'
    default:
      return 'slate'
  }
}

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

function fmtMoney(cents?: number | null): string {
  if (cents == null) return '—'
  return '$' + Math.round(cents / 100).toLocaleString()
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return null
  return Math.round((db - da) / 86400000)
}

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [account, setAccount] = useState<Account | null>(null)
  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    domain: '',
    plan: '',
    arr: '',
    health: '',
    contract_start: '',
    target_go_live: '',
  })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getAccount(id)
      const acc: Account = res?.account ?? res
      const trk: Tracker | null = res?.tracker ?? null
      setAccount(acc)
      setTracker(trk)
      // Tracker summary (richer): fall back to inline tracker from account response.
      if (trk?.id) {
        try {
          const tr = await api.getTracker(trk.id)
          setTracker(tr?.tracker ?? trk)
        } catch {
          setTracker(trk)
        }
      }
      try {
        const act = await api.getActivities({ account: id })
        setActivities(Array.isArray(act) ? act : act?.activities ?? [])
      } catch {
        setActivities([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load account')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  function openEdit() {
    if (!account) return
    setForm({
      name: account.name ?? '',
      domain: account.domain ?? '',
      plan: account.plan ?? '',
      arr: account.arr_cents != null ? String(Math.round(account.arr_cents / 100)) : '',
      health: account.health ?? '',
      contract_start: account.contract_start ? account.contract_start.slice(0, 10) : '',
      target_go_live: account.target_go_live ? account.target_go_live.slice(0, 10) : '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!account) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        domain: form.domain.trim() || null,
        plan: form.plan.trim() || null,
        health: form.health.trim() || null,
        arr_cents: form.arr.trim() ? Math.round(Number(form.arr) * 100) : null,
        contract_start: form.contract_start || null,
        target_go_live: form.target_go_live || null,
      }
      const updated = await api.updateAccount(account.id, body)
      setAccount(updated?.account ?? updated ?? { ...account, ...body } as Account)
      setEditOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save account')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner label="Loading account..." />

  if (error && !account) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          title="Could not load account"
          description={error}
          action={
            <div className="flex gap-2">
              <Button onClick={load}>Retry</Button>
              <Link href="/dashboard/accounts">
                <Button variant="secondary">Back to accounts</Button>
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <EmptyState
          title="Account not found"
          description="This account may have been deleted."
          action={
            <Link href="/dashboard/accounts">
              <Button variant="secondary">Back to accounts</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const ttvFirstValue = daysBetween(tracker?.started_at, tracker?.first_value_at)
  const ttvGoLive = daysBetween(tracker?.started_at, tracker?.go_live_at)
  const progress = Math.max(0, Math.min(100, Math.round(tracker?.progress_pct ?? 0)))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/dashboard/accounts" className="hover:text-teal-300">
              Accounts
            </Link>
            <span>/</span>
            <span className="text-slate-300">{account.name}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-100">{account.name}</h1>
            <Badge tone={healthTone(account.health)}>{account.health || 'unknown'}</Badge>
            {account.plan && <Badge tone="blue">{account.plan}</Badge>}
          </div>
          {account.domain && (
            <a
              href={`https://${account.domain.replace(/^https?:\/\//, '')}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-teal-400 hover:text-teal-300"
            >
              {account.domain}
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openEdit}>
            Edit account
          </Button>
          {tracker?.id ? (
            <Link href={`/dashboard/trackers/${tracker.id}`}>
              <Button>Open tracker</Button>
            </Link>
          ) : (
            <Link href="/dashboard/trackers/new">
              <Button>Start tracker</Button>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="ARR" value={fmtMoney(account.arr_cents)} tone="teal" />
        <Stat
          label="Days to first value"
          value={ttvFirstValue != null ? `${ttvFirstValue}d` : '—'}
          sub={tracker?.first_value_at ? fmtDate(tracker.first_value_at) : 'not yet reached'}
          tone={ttvFirstValue != null ? 'green' : 'default'}
        />
        <Stat
          label="Days to go-live"
          value={ttvGoLive != null ? `${ttvGoLive}d` : '—'}
          sub={tracker?.go_live_at ? fmtDate(tracker.go_live_at) : 'in progress'}
          tone={ttvGoLive != null ? 'green' : 'default'}
        />
        <Stat
          label="Risk score"
          value={tracker?.risk_score != null ? tracker.risk_score : '—'}
          tone={(tracker?.risk_score ?? 0) >= 60 ? 'red' : (tracker?.risk_score ?? 0) >= 30 ? 'amber' : 'default'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Account details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Account details</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Detail label="Plan" value={account.plan || '—'} />
            <Detail label="Domain" value={account.domain || '—'} />
            <Detail label="ARR" value={fmtMoney(account.arr_cents)} />
            <Detail label="Contract start" value={fmtDate(account.contract_start)} />
            <Detail label="Target go-live" value={fmtDate(account.target_go_live)} />
            <Detail label="Created" value={fmtDate(account.created_at)} />
          </CardBody>
        </Card>

        {/* Linked tracker summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Onboarding tracker</h2>
            {tracker?.status && <Badge tone={statusTone(tracker.status)}>{tracker.status}</Badge>}
          </CardHeader>
          <CardBody>
            {tracker?.id ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span>Onboarding progress</span>
                    <span className="tabular-nums text-slate-300">{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <Detail label="Started" value={fmtDate(tracker.started_at)} />
                  <Detail label="First value" value={fmtDate(tracker.first_value_at)} />
                  <Detail label="Projected go-live" value={fmtDate(tracker.projected_go_live)} />
                  <Detail label="Last activity" value={fmtDate(tracker.last_activity_at)} />
                </div>
                <div className="pt-1">
                  <Link href={`/dashboard/trackers/${tracker.id}`}>
                    <Button variant="secondary" size="sm">
                      View milestones, blockers &amp; tasks →
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No onboarding tracker yet"
                description="Start a tracker to follow this account's path to first value and go-live."
                action={
                  <Link href="/dashboard/trackers/new">
                    <Button>Start a tracker</Button>
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Activity timeline */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-200">Activity</h2>
        </CardHeader>
        <CardBody>
          {activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No activity recorded for this account yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Actor</TH>
                  <TH>Message</TH>
                </TR>
              </THead>
              <TBody>
                {activities.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-slate-400">{fmtDateTime(a.created_at)}</TD>
                    <TD>
                      <Badge tone="slate">{a.type || 'event'}</Badge>
                    </TD>
                    <TD className="text-slate-400">{a.actor || '—'}</TD>
                    <TD>{a.message || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit account"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Domain">
              <input
                className="input"
                value={form.domain}
                placeholder="acme.com"
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
              />
            </Field>
            <Field label="Plan">
              <input
                className="input"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ARR (USD/yr)">
              <input
                className="input"
                type="number"
                value={form.arr}
                onChange={(e) => setForm({ ...form, arr: e.target.value })}
              />
            </Field>
            <Field label="Health">
              <select
                className="input"
                value={form.health}
                onChange={(e) => setForm({ ...form, health: e.target.value })}
              >
                <option value="">—</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="red">Red</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract start">
              <input
                className="input"
                type="date"
                value={form.contract_start}
                onChange={(e) => setForm({ ...form, contract_start: e.target.value })}
              />
            </Field>
            <Field label="Target go-live">
              <input
                className="input"
                type="date"
                value={form.target_go_live}
                onChange={(e) => setForm({ ...form, target_go_live: e.target.value })}
              />
            </Field>
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

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-200">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}
