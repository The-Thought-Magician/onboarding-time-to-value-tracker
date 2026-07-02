'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Notification {
  id: string
  type: string
  title: string
  body?: string
  link?: string
  read: boolean
  created_at?: string
}
interface AlertRule {
  id: string
  name: string
  metric: string
  comparator: string
  threshold: number
  severity: string
  active: boolean
  created_at?: string
}

const METRICS: { value: string; label: string }[] = [
  { value: 'days_overdue', label: 'Days overdue' },
  { value: 'risk_score', label: 'Risk score' },
  { value: 'days_to_first_value', label: 'Days to first value' },
  { value: 'days_to_go_live', label: 'Days to go-live' },
  { value: 'days_since_activity', label: 'Days since activity' },
  { value: 'open_blockers', label: 'Open blockers' },
]
const COMPARATORS: { value: string; label: string }[] = [
  { value: 'gte', label: '≥' },
  { value: 'gt', label: '>' },
  { value: 'lte', label: '≤' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
]
const SEVERITIES = ['on_track', 'at_risk', 'critical'] as const
type Severity = (typeof SEVERITIES)[number]

const SEVERITY_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  on_track: 'green',
  at_risk: 'amber',
  critical: 'red',
}
const SEVERITY_LABEL: Record<string, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  critical: 'Critical',
}

const TYPE_TONE: Record<string, 'teal' | 'amber' | 'red' | 'blue' | 'slate'> = {
  sla_breach: 'red',
  at_risk: 'amber',
  overdue: 'amber',
  stalled: 'red',
  blocker: 'red',
  milestone: 'teal',
  go_live: 'green' as never,
  info: 'blue',
}

function fmtWhen(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface RuleForm {
  name: string
  metric: string
  comparator: string
  threshold: string
  severity: Severity
  active: boolean
}
const emptyRule: RuleForm = {
  name: '',
  metric: 'days_overdue',
  comparator: 'gte',
  threshold: '7',
  severity: 'at_risk',
  active: true,
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'feed' | 'rules'>('feed')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AlertRule | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyRule)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [notifs, ruleList] = await Promise.all([
        api.getNotifications().catch(() => []),
        api.getAlertRules().catch(() => []),
      ])
      setNotifications(Array.isArray(notifs) ? notifs : [])
      setRules(Array.isArray(ruleList) ? ruleList : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])
  const visibleNotifs = useMemo(
    () => (unreadOnly ? notifications.filter((n) => !n.read) : notifications),
    [notifications, unreadOnly]
  )

  async function markRead(n: Notification) {
    if (n.read) return
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    try {
      await api.markNotificationRead(n.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark read')
      await load()
    }
  }

  async function markAll() {
    setBusy(true)
    try {
      await api.markAllNotificationsRead()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark all read')
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      await api.generateNotifications()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate notifications')
    } finally {
      setBusy(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyRule)
    setFormError(null)
    setModalOpen(true)
  }
  function openEdit(r: AlertRule) {
    setEditing(r)
    setForm({
      name: r.name ?? '',
      metric: r.metric ?? 'days_overdue',
      comparator: r.comparator ?? 'gte',
      threshold: String(r.threshold ?? 0),
      severity: (SEVERITIES.includes(r.severity as Severity) ? r.severity : 'at_risk') as Severity,
      active: r.active ?? true,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submitRule() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    const threshold = parseFloat(form.threshold)
    if (isNaN(threshold)) {
      setFormError('Threshold must be a number')
      return
    }
    setBusy(true)
    setFormError(null)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      metric: form.metric,
      comparator: form.comparator,
      threshold,
      severity: form.severity,
      active: form.active,
    }
    try {
      if (editing) await api.updateAlertRule(editing.id, payload)
      else await api.createAlertRule(payload)
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save rule')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(r: AlertRule) {
    setBusy(true)
    try {
      await api.updateAlertRule(r.id, { active: !r.active })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update rule')
    } finally {
      setBusy(false)
    }
  }

  async function removeRule(r: AlertRule) {
    if (!confirm(`Delete alert rule "${r.name}"?`)) return
    setBusy(true)
    try {
      await api.deleteAlertRule(r.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule')
    } finally {
      setBusy(false)
    }
  }

  function comparatorLabel(c: string): string {
    return COMPARATORS.find((x) => x.value === c)?.label ?? c
  }
  function metricLabel(m: string): string {
    return METRICS.find((x) => x.value === m)?.label ?? m
  }

  if (loading) return <PageSpinner label="Loading notifications..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Notifications</h1>
          <p className="mt-1 text-sm text-stone-400">
            Alerts from at-risk and overdue onboarding state, plus the rules that drive them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generate} disabled={busy}>
            {busy ? 'Working...' : 'Generate Now'}
          </Button>
          {tab === 'feed' ? (
            <Button onClick={markAll} disabled={busy || unreadCount === 0}>
              Mark all read
            </Button>
          ) : (
            <Button onClick={openCreate}>+ New Rule</Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button className="text-rose-200 hover:text-white" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Notifications" value={notifications.length} />
        <Stat label="Unread" value={unreadCount} tone={unreadCount > 0 ? 'amber' : 'default'} />
        <Stat label="Alert rules" value={rules.length} tone="teal" />
        <Stat label="Active rules" value={rules.filter((r) => r.active).length} tone="green" />
      </div>

      <div className="flex items-center gap-2 border-b border-stone-800">
        <button
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'feed'
              ? 'border-rose-500 text-rose-300'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
          onClick={() => setTab('feed')}
        >
          Feed
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[11px] text-rose-300">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'rules'
              ? 'border-rose-500 text-rose-300'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
          onClick={() => setTab('rules')}
        >
          Alert Rules
        </button>
      </div>

      {tab === 'feed' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="h-4 w-4 rounded border-stone-600 bg-stone-800 text-rose-500 focus:ring-rose-500"
              />
              Unread only
            </label>
            <span className="text-xs text-stone-500">{visibleNotifs.length} shown</span>
          </div>

          {visibleNotifs.length === 0 ? (
            <EmptyState
              icon="🔔"
              title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
              description="Run Generate Now to scan current at-risk and overdue trackers for alerts."
              action={
                <Button variant="secondary" onClick={generate} disabled={busy}>
                  Generate Now
                </Button>
              }
            />
          ) : (
            <Card>
              <ul className="divide-y divide-stone-800">
                {visibleNotifs.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-3 px-5 py-4">
                      <span
                        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                          n.read ? 'bg-stone-700' : 'bg-rose-400'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-medium ${n.read ? 'text-stone-400' : 'text-stone-100'}`}>
                            {n.title}
                          </span>
                          <Badge tone={TYPE_TONE[n.type] ?? 'slate'}>{n.type.replace(/_/g, ' ')}</Badge>
                        </div>
                        {n.body && <p className="mt-1 text-sm text-stone-400">{n.body}</p>}
                        <div className="mt-1 text-xs text-stone-500">{fmtWhen(n.created_at)}</div>
                      </div>
                      {!n.read && (
                        <button
                          className="flex-shrink-0 text-xs text-rose-400 hover:text-rose-300"
                          onClick={(e) => {
                            e.preventDefault()
                            markRead(n)
                          }}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  )
                  return (
                    <li key={n.id} className="transition-colors hover:bg-stone-800/30">
                      {n.link ? (
                        <Link href={n.link} onClick={() => markRead(n)} className="block">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Alert Rules</h2>
          </CardHeader>
          {rules.length === 0 ? (
            <CardBody>
              <EmptyState
                icon="⚙"
                title="No alert rules"
                description="Create rules that flag trackers when a metric crosses a threshold."
                action={<Button onClick={openCreate}>+ New Rule</Button>}
              />
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Condition</TH>
                  <TH>Severity</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rules.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium text-stone-100">{r.name}</TD>
                    <TD>
                      <span className="text-stone-300">{metricLabel(r.metric)}</span>{' '}
                      <span className="font-mono text-rose-300">{comparatorLabel(r.comparator)}</span>{' '}
                      <span className="tabular-nums text-stone-200">{r.threshold}</span>
                    </TD>
                    <TD>
                      <Badge tone={SEVERITY_TONE[r.severity] ?? 'slate'}>
                        {SEVERITY_LABEL[r.severity] ?? r.severity}
                      </Badge>
                    </TD>
                    <TD>
                      <button onClick={() => toggleRule(r)} disabled={busy} title="Toggle active">
                        <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'Active' : 'Paused'}</Badge>
                      </button>
                    </TD>
                    <TD className="text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeRule(r)} disabled={busy}>
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
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Alert Rule' : 'New Alert Rule'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitRule} disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Rule'}
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
              placeholder="e.g. Overdue more than a week"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="mb-1 block text-xs font-medium text-stone-400">Comparator</label>
              <select
                value={form.comparator}
                onChange={(e) => setForm({ ...form, comparator: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                {COMPARATORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} ({c.value})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-stone-400">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
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
