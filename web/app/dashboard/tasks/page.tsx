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

interface TeamMember {
  id: string
  name: string
  email?: string
  role?: string
}

interface Task {
  id: string
  workspace_id?: string
  tracker_id?: string | null
  tracker_milestone_id?: string | null
  title: string
  description?: string
  assignee_id?: string | null
  due_date?: string | null
  status: string
  created_at?: string
  updated_at?: string
}

const STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const
type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

const STATUS_TONE: Record<string, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  open: 'slate',
  in_progress: 'blue',
  blocked: 'red',
  done: 'green',
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(t: Task): boolean {
  if (!t.due_date || t.status === 'done') return false
  const d = new Date(t.due_date)
  if (isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FormState {
  title: string
  description: string
  assignee_id: string
  due_date: string
  status: Status
  tracker_id: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  assignee_id: '',
  due_date: '',
  status: 'open',
  tracker_id: '',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [view, setView] = useState<'board' | 'mine'>('board')
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | Status>('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [allTasks, mine, members] = await Promise.all([
        api.getTasks(),
        api.getMyTasks().catch(() => []),
        api.getTeam().catch(() => []),
      ])
      setTasks(Array.isArray(allTasks) ? allTasks : [])
      setMyTasks(Array.isArray(mine) ? mine : [])
      setTeam(Array.isArray(members) ? members : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const teamById = useMemo(() => {
    const m = new Map<string, TeamMember>()
    for (const t of team) m.set(t.id, t)
    return m
  }, [team])

  const source = view === 'mine' ? myTasks : tasks

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return source.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false
      if (assigneeFilter && t.assignee_id !== assigneeFilter) return false
      if (q) {
        const hay = `${t.title} ${t.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [source, search, statusFilter, assigneeFilter])

  const grouped = useMemo(() => {
    const g: Record<Status, Task[]> = { open: [], in_progress: [], blocked: [], done: [] }
    for (const t of filtered) {
      const s = (STATUSES.includes(t.status as Status) ? t.status : 'open') as Status
      g[s].push(t)
    }
    return g
  }, [filtered])

  const stats = useMemo(() => {
    const total = tasks.length
    const open = tasks.filter((t) => t.status !== 'done').length
    const overdue = tasks.filter(isOverdue).length
    const done = tasks.filter((t) => t.status === 'done').length
    return { total, open, overdue, done, mine: myTasks.length }
  }, [tasks, myTasks])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title ?? '',
      description: t.description ?? '',
      assignee_id: t.assignee_id ?? '',
      due_date: t.due_date ? new Date(t.due_date).toISOString().slice(0, 10) : '',
      status: (STATUSES.includes(t.status as Status) ? t.status : 'open') as Status,
      tracker_id: t.tracker_id ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submitForm() {
    if (!form.title.trim()) {
      setFormError('Title is required')
      return
    }
    setBusy(true)
    setFormError(null)
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      assignee_id: form.assignee_id || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      status: form.status,
      tracker_id: form.tracker_id.trim() || null,
    }
    try {
      if (editing) {
        await api.updateTask(editing.id, payload)
      } else {
        await api.createTask(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save task')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(t: Task, status: Status) {
    setBusy(true)
    try {
      await api.updateTask(t.id, { status })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task')
    } finally {
      setBusy(false)
    }
  }

  async function removeTask(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return
    setBusy(true)
    try {
      await api.deleteTask(t.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading tasks..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Tasks</h1>
          <p className="mt-1 text-sm text-stone-400">
            Action items across onboarding implementations.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Task</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button className="text-rose-200 hover:text-white" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} tone="teal" />
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'default'} />
        <Stat label="Done" value={stats.done} tone="green" />
        <Stat label="Assigned to me" value={stats.mine} tone="amber" />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-stone-700 bg-stone-800/60 p-0.5">
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'board' ? 'bg-rose-500 text-stone-950' : 'text-stone-300 hover:text-white'
              }`}
              onClick={() => setView('board')}
            >
              All Tasks
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'mine' ? 'bg-rose-500 text-stone-950' : 'text-stone-300 hover:text-white'
              }`}
              onClick={() => setView('mine')}
            >
              My Tasks
            </button>
          </div>

          <input
            type="search"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[180px] flex-1 rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-rose-500 focus:outline-none"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | Status)}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
          >
            <option value="">All assignees</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon="✓"
          title={view === 'mine' ? 'No tasks assigned to you' : 'No tasks yet'}
          description={
            view === 'mine'
              ? 'Tasks assigned to you and overdue items will appear here.'
              : 'Create a task to track onboarding action items.'
          }
          action={view === 'board' ? <Button onClick={openCreate}>+ New Task</Button> : undefined}
        />
      ) : view === 'mine' ? (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Assignee</TH>
                <TH>Due</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="font-medium text-stone-100">{t.title}</div>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-stone-500">{t.description}</div>
                    )}
                  </TD>
                  <TD>{t.assignee_id ? teamById.get(t.assignee_id)?.name ?? 'Unknown' : '—'}</TD>
                  <TD>
                    <span className={isOverdue(t) ? 'text-rose-300' : ''}>{fmtDate(t.due_date)}</span>
                    {isOverdue(t) && <Badge tone="red" className="ml-2">Overdue</Badge>}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[t.status] ?? 'slate'}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex gap-2">
                      {t.status !== 'done' && (
                        <Button size="sm" variant="secondary" onClick={() => changeStatus(t, 'done')} disabled={busy}>
                          Done
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((col) => (
            <div key={col} className="flex flex-col rounded-xl border border-stone-800 bg-stone-900/50">
              <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[col]}>{STATUS_LABEL[col]}</Badge>
                  <span className="text-xs text-stone-500">{grouped[col].length}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 p-3">
                {grouped[col].length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-stone-600">No tasks</p>
                ) : (
                  grouped[col].map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-stone-800 bg-stone-900 p-3 transition-colors hover:border-stone-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          className="text-left text-sm font-medium text-stone-100 hover:text-rose-300"
                          onClick={() => openEdit(t)}
                        >
                          {t.title}
                        </button>
                        <button
                          className="text-stone-600 hover:text-rose-400"
                          onClick={() => removeTask(t)}
                          aria-label="Delete"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                      {t.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-stone-500">{t.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                        {t.assignee_id && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            {teamById.get(t.assignee_id)?.name ?? 'Unknown'}
                          </span>
                        )}
                        {t.due_date && (
                          <span className={isOverdue(t) ? 'text-rose-300' : ''}>{fmtDate(t.due_date)}</span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {STATUSES.filter((s) => s !== col).map((s) => (
                          <button
                            key={s}
                            onClick={() => changeStatus(t, s)}
                            disabled={busy}
                            className="rounded border border-stone-700 px-2 py-0.5 text-[11px] text-stone-400 hover:border-rose-500 hover:text-rose-300 disabled:opacity-50"
                          >
                            → {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Task' : 'New Task'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save Changes' : 'Create Task'}
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
            <label className="mb-1 block text-xs font-medium text-stone-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              placeholder="e.g. Schedule kickoff call"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              placeholder="Optional details"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Assignee</label>
              <select
                value={form.assignee_id}
                onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Due date</label>
              <input
                type="date"
                value={form.due_date}
                min={todayInput()}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Tracker ID (optional)</label>
              <input
                value={form.tracker_id}
                onChange={(e) => setForm({ ...form, tracker_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 focus:border-rose-500 focus:outline-none"
                placeholder="Link to a tracker"
              />
            </div>
          </div>
          {editing && (
            <div className="border-t border-stone-800 pt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setModalOpen(false)
                  removeTask(editing)
                }}
                disabled={busy}
              >
                Delete Task
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
