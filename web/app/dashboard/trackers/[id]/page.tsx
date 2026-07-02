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

interface Account {
  id: string
  name: string
  domain?: string | null
  plan?: string | null
  arr_cents?: number | null
  health?: string | null
  target_go_live?: string | null
}
interface Tracker {
  id: string
  account_id: string
  status?: string | null
  current_milestone_id?: string | null
  started_at?: string | null
  first_value_at?: string | null
  go_live_at?: string | null
  projected_go_live?: string | null
  progress_pct?: number | null
  risk_score?: number | null
  last_activity_at?: string | null
}
interface TrackerMilestone {
  id: string
  tracker_id: string
  name: string
  category?: string | null
  position: number
  target_days?: number | null
  weight?: number | null
  is_first_value?: boolean | null
  is_go_live?: boolean | null
  status?: string | null
  started_at?: string | null
  completed_at?: string | null
}
interface Activity {
  id: string
  type?: string | null
  actor?: string | null
  message?: string | null
  created_at?: string
}
interface Blocker {
  id: string
  tracker_id: string
  tracker_milestone_id?: string | null
  category?: string | null
  title: string
  description?: string | null
  severity?: string | null
  owner?: string | null
  status?: string | null
  opened_at?: string | null
  resolved_at?: string | null
}
interface Note {
  id: string
  tracker_id: string
  author?: string | null
  body: string
  customer_visible?: boolean | null
  pinned?: boolean | null
  created_at?: string
}
interface Task {
  id: string
  tracker_id: string
  title: string
  description?: string | null
  due_date?: string | null
  status?: string | null
}

type Tab = 'milestones' | 'blockers' | 'notes' | 'tasks'

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtArr(cents?: number | null) {
  if (cents == null) return '—'
  return `$${Math.round(cents / 100).toLocaleString()}`
}
function msTone(status?: string | null): 'green' | 'amber' | 'teal' | 'slate' | 'red' {
  switch ((status || '').toLowerCase()) {
    case 'complete':
    case 'completed':
    case 'done':
      return 'green'
    case 'in_progress':
    case 'started':
    case 'active':
      return 'teal'
    case 'blocked':
      return 'red'
    case 'pending':
    case 'not_started':
      return 'slate'
    default:
      return 'slate'
  }
}
function sevTone(sev?: string | null): 'red' | 'amber' | 'blue' | 'slate' {
  switch ((sev || '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'red'
    case 'medium':
      return 'amber'
    case 'low':
      return 'blue'
    default:
      return 'slate'
  }
}

export default function TrackerWorkspacePage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [milestones, setMilestones] = useState<TrackerMilestone[]>([])
  const [account, setAccount] = useState<Account | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [tasks, setTasks] = useState<Task[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('milestones')

  // modals
  const [blockerOpen, setBlockerOpen] = useState(false)
  const [blockerForm, setBlockerForm] = useState({ title: '', description: '', category: '', severity: 'medium', owner: '', tracker_milestone_id: '' })
  const [noteForm, setNoteForm] = useState({ body: '', author: '', customer_visible: false })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', due_date: '', tracker_milestone_id: '' })
  const [shareOpen, setShareOpen] = useState(false)
  const [shareForm, setShareForm] = useState({ title: '' })
  const [shareResult, setShareResult] = useState<{ token?: string } | null>(null)
  const [formError, setFormError] = useState('')

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const res = await api.getTracker(id)
      setTracker(res?.tracker ?? null)
      setMilestones([...(res?.milestones ?? [])].sort((a: TrackerMilestone, b: TrackerMilestone) => a.position - b.position))
      setAccount(res?.account ?? null)
      setActivity(res?.activity ?? [])
      const [b, n, t] = await Promise.all([
        api.getBlockers({ tracker: id }),
        api.getNotes({ tracker: id }),
        api.getTasks({ tracker: id }),
      ])
      setBlockers(Array.isArray(b) ? b : [])
      setNotes(Array.isArray(n) ? n : [])
      setTasks(Array.isArray(t) ? t : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tracker')
    } finally {
      setLoading(false)
    }
  }

  async function refreshTrackerFromResponse(res: { tracker?: Tracker; milestones?: TrackerMilestone[] }) {
    if (res?.tracker) setTracker(res.tracker)
    if (res?.milestones) setMilestones([...res.milestones].sort((a, b) => a.position - b.position))
    // refresh activity (cheap)
    try {
      const full = await api.getTracker(id)
      if (full?.activity) setActivity(full.activity)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (id) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const currentMilestone = useMemo(
    () => milestones.find((m) => m.id === tracker?.current_milestone_id) ?? null,
    [milestones, tracker],
  )
  const completedCount = milestones.filter((m) => msTone(m.status) === 'green').length
  const progress = tracker?.progress_pct ?? (milestones.length ? Math.round((completedCount / milestones.length) * 100) : 0)
  const openBlockers = blockers.filter((b) => (b.status || '').toLowerCase() !== 'resolved')
  const openTasks = tasks.filter((t) => (t.status || '').toLowerCase() !== 'done' && (t.status || '').toLowerCase() !== 'complete' && (t.status || '').toLowerCase() !== 'completed')

  async function advance() {
    setBusy(true)
    setError('')
    try {
      const res = await api.advanceTracker(id)
      await refreshTrackerFromResponse(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance')
    } finally {
      setBusy(false)
    }
  }
  async function regress() {
    setBusy(true)
    setError('')
    try {
      const res = await api.regressTracker(id)
      await refreshTrackerFromResponse(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regress')
    } finally {
      setBusy(false)
    }
  }
  async function setMilestoneStatus(m: TrackerMilestone, status: string) {
    setBusy(true)
    try {
      const updated: TrackerMilestone = await api.updateTrackerMilestone(id, m.id, { status })
      setMilestones((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, status, ...updated } : x)).sort((a, b) => a.position - b.position),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update milestone')
    } finally {
      setBusy(false)
    }
  }

  async function createBlocker(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!blockerForm.title.trim()) {
      setFormError('Title is required')
      return
    }
    setBusy(true)
    try {
      const created: Blocker = await api.createBlocker({
        tracker_id: id,
        tracker_milestone_id: blockerForm.tracker_milestone_id || undefined,
        title: blockerForm.title.trim(),
        description: blockerForm.description.trim() || undefined,
        category: blockerForm.category.trim() || undefined,
        severity: blockerForm.severity,
        owner: blockerForm.owner.trim() || undefined,
      })
      setBlockers((prev) => [created, ...prev])
      setBlockerOpen(false)
      setBlockerForm({ title: '', description: '', category: '', severity: 'medium', owner: '', tracker_milestone_id: '' })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create blocker')
    } finally {
      setBusy(false)
    }
  }
  async function resolveBlocker(b: Blocker) {
    setBusy(true)
    try {
      const updated: Blocker = await api.resolveBlocker(b.id)
      setBlockers((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: 'resolved', resolved_at: new Date().toISOString(), ...updated } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve blocker')
    } finally {
      setBusy(false)
    }
  }

  async function createNote(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!noteForm.body.trim()) {
      setFormError('Note body is required')
      return
    }
    setBusy(true)
    try {
      const created: Note = await api.createNote({
        tracker_id: id,
        body: noteForm.body.trim(),
        author: noteForm.author.trim() || undefined,
        customer_visible: noteForm.customer_visible,
      })
      setNotes((prev) => [created, ...prev])
      setNoteForm({ body: '', author: '', customer_visible: false })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add note')
    } finally {
      setBusy(false)
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!taskForm.title.trim()) {
      setFormError('Title is required')
      return
    }
    setBusy(true)
    try {
      const created: Task = await api.createTask({
        tracker_id: id,
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        due_date: taskForm.due_date || undefined,
        tracker_milestone_id: taskForm.tracker_milestone_id || undefined,
      })
      setTasks((prev) => [created, ...prev])
      setTaskForm({ title: '', description: '', due_date: '', tracker_milestone_id: '' })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setBusy(false)
    }
  }

  async function createShare(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const plan = await api.createSharedPlan({
        tracker_id: id,
        title: shareForm.title.trim() || (account ? `${account.name} onboarding plan` : 'Onboarding plan'),
      })
      setShareResult(plan)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create shared plan')
    } finally {
      setBusy(false)
    }
  }

  const shareUrl = shareResult?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/plan/${shareResult.token}`
    : ''

  if (loading) return <PageSpinner label="Loading tracker workspace..." />

  if (error && !tracker) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/trackers" className="text-sm text-rose-400 hover:text-rose-300">
          ← Back to trackers
        </Link>
        <EmptyState title="Could not load tracker" description={error} />
      </div>
    )
  }
  if (!tracker) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/trackers" className="text-sm text-rose-400 hover:text-rose-300">
          ← Back to trackers
        </Link>
        <EmptyState title="Tracker not found" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/trackers" className="text-sm text-rose-400 hover:text-rose-300">
          ← Back to trackers
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { setShareResult(null); setShareForm({ title: '' }); setShareOpen(true) }}>
            Share plan
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-100">
              {account ? (
                <Link href={`/dashboard/accounts/${account.id}`} className="hover:text-rose-300">
                  {account.name}
                </Link>
              ) : (
                'Tracker'
              )}
            </h1>
            <Badge tone={(tracker.status || '').toLowerCase() === 'live' || (tracker.status || '').toLowerCase() === 'complete' ? 'green' : 'teal'}>
              {tracker.status || 'active'}
            </Badge>
            {account?.health && <Badge tone={account.health === 'green' ? 'green' : account.health === 'red' ? 'red' : 'amber'}>{account.health}</Badge>}
          </div>
          <p className="mt-1 text-sm text-stone-400">
            {account?.domain && <span>{account.domain} · </span>}
            {account?.plan && <span>{account.plan} · </span>}
            ARR {fmtArr(account?.arr_cents)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={regress} disabled={busy}>
            ← Regress
          </Button>
          <Button onClick={advance} disabled={busy}>
            Advance →
          </Button>
        </div>
      </div>

      {/* KPIs + progress */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Progress" value={`${progress}%`} tone="teal" sub={`${completedCount}/${milestones.length} milestones`} />
        <Stat label="Risk score" value={tracker.risk_score ?? '—'} tone={(tracker.risk_score ?? 0) >= 60 ? 'red' : (tracker.risk_score ?? 0) >= 30 ? 'amber' : 'green'} />
        <Stat label="First value" value={fmtDate(tracker.first_value_at)} sub={tracker.first_value_at ? 'Reached' : 'Pending'} />
        <Stat label="Go-live" value={fmtDate(tracker.go_live_at)} sub={tracker.go_live_at ? 'Live' : `Projected ${fmtDate(tracker.projected_go_live)}`} />
      </div>

      <Card>
        <CardBody>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-stone-400">
              Current milestone:{' '}
              <span className="font-medium text-stone-100">{currentMilestone?.name ?? 'None'}</span>
            </span>
            <span className="text-stone-500">Started {fmtDate(tracker.started_at)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
            <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        </CardBody>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stone-800">
        {([
          ['milestones', `Milestones (${milestones.length})`],
          ['blockers', `Blockers (${openBlockers.length})`],
          ['notes', `Notes (${notes.length})`],
          ['tasks', `Tasks (${openTasks.length})`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-rose-500 text-rose-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Milestones tab */}
      {tab === 'milestones' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {milestones.length === 0 ? (
              <EmptyState title="No milestones" description="This tracker has no milestones." />
            ) : (
              <ol className="space-y-3">
                {milestones.map((m, i) => {
                  const done = msTone(m.status) === 'green'
                  const isCurrent = m.id === tracker.current_milestone_id
                  return (
                    <li
                      key={m.id}
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        isCurrent ? 'border-rose-500/50 bg-rose-500/5' : 'border-stone-800 bg-stone-900/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          done ? 'bg-emerald-500 text-stone-950' : isCurrent ? 'bg-rose-500 text-stone-950' : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {done ? '✓' : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-100">{m.name}</span>
                          {m.is_first_value && <Badge tone="teal">First value</Badge>}
                          {m.is_go_live && <Badge tone="green">Go-live</Badge>}
                          <Badge tone={msTone(m.status)}>{m.status || 'pending'}</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-stone-400">
                          {m.category && <span className="rounded bg-stone-800 px-2 py-0.5">{m.category}</span>}
                          {m.target_days != null && <span className="rounded bg-stone-800 px-2 py-0.5">{m.target_days}d target</span>}
                          {m.started_at && <span>Started {fmtDate(m.started_at)}</span>}
                          {m.completed_at && <span>Done {fmtDate(m.completed_at)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMilestoneStatus(m, 'in_progress')}>
                          Start
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMilestoneStatus(m, 'blocked')} className="text-rose-300 hover:text-rose-200">
                          Block
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMilestoneStatus(m, 'complete')} className="text-emerald-300 hover:text-emerald-200">
                          Complete
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
          <div>
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-stone-100">Recent activity</h3>
              </CardHeader>
              <CardBody>
                {activity.length === 0 ? (
                  <p className="text-sm text-stone-500">No activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {activity.slice(0, 12).map((a) => (
                      <li key={a.id} className="border-l-2 border-stone-800 pl-3 text-sm">
                        <div className="text-stone-200">{a.message || a.type}</div>
                        <div className="text-xs text-stone-500">
                          {a.actor && <span>{a.actor} · </span>}
                          {fmtDate(a.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* Blockers tab */}
      {tab === 'blockers' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-100">Blockers</h3>
            <Button size="sm" onClick={() => { setFormError(''); setBlockerOpen(true) }}>+ Log blocker</Button>
          </CardHeader>
          <CardBody>
            {blockers.length === 0 ? (
              <EmptyState title="No blockers" description="Nothing is holding this onboarding back right now." />
            ) : (
              <ul className="space-y-3">
                {blockers.map((b) => {
                  const resolved = (b.status || '').toLowerCase() === 'resolved'
                  return (
                    <li key={b.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-medium ${resolved ? 'text-stone-400 line-through' : 'text-stone-100'}`}>{b.title}</span>
                            <Badge tone={sevTone(b.severity)}>{b.severity || 'medium'}</Badge>
                            {b.category && <Badge tone="slate">{b.category}</Badge>}
                            <Badge tone={resolved ? 'green' : 'amber'}>{b.status || 'open'}</Badge>
                          </div>
                          {b.description && <p className="mt-1 text-sm text-stone-400">{b.description}</p>}
                          <div className="mt-1 text-xs text-stone-500">
                            {b.owner && <span>Owner {b.owner} · </span>}
                            Opened {fmtDate(b.opened_at)}
                            {resolved && b.resolved_at && <span> · Resolved {fmtDate(b.resolved_at)}</span>}
                          </div>
                        </div>
                        {!resolved && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => resolveBlocker(b)}>
                            Resolve
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 self-start">
            <CardHeader>
              <h3 className="text-sm font-semibold text-stone-100">Add note</h3>
            </CardHeader>
            <CardBody>
              <form onSubmit={createNote} className="space-y-3">
                {formError && tab === 'notes' && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">{formError}</div>
                )}
                <textarea
                  value={noteForm.body}
                  onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })}
                  rows={4}
                  placeholder="What's happening with this account..."
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                />
                <input
                  value={noteForm.author}
                  onChange={(e) => setNoteForm({ ...noteForm, author: e.target.value })}
                  placeholder="Author (optional)"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={noteForm.customer_visible}
                    onChange={(e) => setNoteForm({ ...noteForm, customer_visible: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-600 bg-stone-800 text-rose-500 focus:ring-rose-500"
                  />
                  Customer-visible
                </label>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Saving...' : 'Add note'}
                </Button>
              </form>
            </CardBody>
          </Card>
          <div className="lg:col-span-2">
            {notes.length === 0 ? (
              <EmptyState title="No notes" description="Capture context, decisions, and customer updates here." />
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {n.pinned && <Badge tone="amber">Pinned</Badge>}
                        {n.customer_visible && <Badge tone="teal">Customer-visible</Badge>}
                      </div>
                      <span className="text-xs text-stone-500">{fmtDate(n.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-stone-200">{n.body}</p>
                    {n.author && <p className="mt-1 text-xs text-stone-500">— {n.author}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 self-start">
            <CardHeader>
              <h3 className="text-sm font-semibold text-stone-100">New task</h3>
            </CardHeader>
            <CardBody>
              <form onSubmit={createTask} className="space-y-3">
                {formError && tab === 'tasks' && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">{formError}</div>
                )}
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Task title"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                />
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={2}
                  placeholder="Details (optional)"
                  className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                />
                <div>
                  <label className="mb-1 block text-xs text-stone-400">Due date</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                  />
                </div>
                {milestones.length > 0 && (
                  <select
                    value={taskForm.tracker_milestone_id}
                    onChange={(e) => setTaskForm({ ...taskForm, tracker_milestone_id: e.target.value })}
                    className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
                  >
                    <option value="">No milestone</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Saving...' : 'Add task'}
                </Button>
              </form>
            </CardBody>
          </Card>
          <div className="lg:col-span-2">
            {tasks.length === 0 ? (
              <EmptyState title="No tasks" description="Break the next milestone into actionable tasks." />
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => {
                  const done = ['done', 'complete', 'completed'].includes((t.status || '').toLowerCase())
                  return (
                    <li key={t.id} className="flex items-start gap-3 rounded-xl border border-stone-800 bg-stone-900/60 p-3">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={busy}
                        onChange={async () => {
                          setBusy(true)
                          try {
                            const next = done ? 'open' : 'done'
                            const updated: Task = await api.updateTask(t.id, { status: next })
                            setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next, ...updated } : x)))
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Failed to update task')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="mt-1 h-4 w-4 rounded border-stone-600 bg-stone-800 text-rose-500 focus:ring-rose-500"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm ${done ? 'text-stone-500 line-through' : 'text-stone-100'}`}>{t.title}</span>
                        {t.description && <p className="text-xs text-stone-400">{t.description}</p>}
                        {t.due_date && <p className="text-xs text-stone-500">Due {fmtDate(t.due_date)}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm(`Delete task "${t.title}"?`)) return
                          setBusy(true)
                          try {
                            await api.deleteTask(t.id)
                            setTasks((prev) => prev.filter((x) => x.id !== t.id))
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Failed to delete task')
                          } finally {
                            setBusy(false)
                          }
                        }}
                        className="text-rose-300 hover:text-rose-200"
                      >
                        ✕
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Blocker modal */}
      <Modal
        open={blockerOpen}
        onClose={() => setBlockerOpen(false)}
        title="Log a blocker"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockerOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="blocker-form" disabled={busy}>
              {busy ? 'Saving...' : 'Log blocker'}
            </Button>
          </>
        }
      >
        <form id="blocker-form" onSubmit={createBlocker} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-300">Title</label>
            <input
              value={blockerForm.title}
              onChange={(e) => setBlockerForm({ ...blockerForm, title: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-300">Description</label>
            <textarea
              value={blockerForm.description}
              onChange={(e) => setBlockerForm({ ...blockerForm, description: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Severity</label>
              <select
                value={blockerForm.severity}
                onChange={(e) => setBlockerForm({ ...blockerForm, severity: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Category</label>
              <input
                value={blockerForm.category}
                onChange={(e) => setBlockerForm({ ...blockerForm, category: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
                placeholder="Legal, Technical..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Owner</label>
              <input
                value={blockerForm.owner}
                onChange={(e) => setBlockerForm({ ...blockerForm, owner: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Milestone</label>
              <select
                value={blockerForm.tracker_milestone_id}
                onChange={(e) => setBlockerForm({ ...blockerForm, tracker_milestone_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>

      {/* Share modal */}
      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share onboarding plan"
        footer={
          shareResult ? (
            <Button onClick={() => setShareOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShareOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" form="share-form" disabled={busy}>
                {busy ? 'Generating...' : 'Create share link'}
              </Button>
            </>
          )
        }
      >
        {shareResult ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-300">Your read-only customer plan is live. Share this link:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-rose-300 focus:outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (shareUrl && navigator.clipboard) navigator.clipboard.writeText(shareUrl)
                }}
              >
                Copy
              </Button>
            </div>
            {shareUrl && (
              <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-rose-400 hover:text-rose-300">
                Open plan ↗
              </a>
            )}
          </div>
        ) : (
          <form id="share-form" onSubmit={createShare} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-300">{formError}</div>
            )}
            <p className="text-sm text-stone-400">
              Generate a public, read-only milestone plan your customer can follow without logging in.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-300">Title</label>
              <input
                value={shareForm.title}
                onChange={(e) => setShareForm({ title: e.target.value })}
                placeholder={account ? `${account.name} onboarding plan` : 'Onboarding plan'}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
              />
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
