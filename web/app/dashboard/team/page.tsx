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
  workspace_id?: string
  user_id?: string
  name: string
  email?: string | null
  role?: string | null
  target_load?: number | null
  active?: boolean
  created_at?: string
}

interface CapacityRow {
  id?: string
  member_id?: string
  name?: string
  active_load?: number
  target_load?: number
  utilization?: number
  [k: string]: unknown
}

const ROLES = ['CSM', 'Onboarding Manager', 'Implementation', 'Solutions Engineer', 'Support', 'Lead']

const ROLE_TONE: Record<string, 'teal' | 'blue' | 'amber' | 'green' | 'slate'> = {
  CSM: 'teal',
  'Onboarding Manager': 'blue',
  Implementation: 'green',
  'Solutions Engineer': 'amber',
  Support: 'slate',
  Lead: 'blue',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

interface FormState {
  name: string
  email: string
  role: string
  target_load: string
  active: boolean
}

const emptyForm: FormState = {
  name: '',
  email: '',
  role: 'CSM',
  target_load: '10',
  active: true,
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [capacity, setCapacity] = useState<CapacityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showInactive, setShowInactive] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [members, cap] = await Promise.all([
        api.getTeam(),
        api.getTeamCapacity().catch(() => []),
      ])
      setTeam(Array.isArray(members) ? members : [])
      setCapacity(Array.isArray(cap) ? cap : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const capByMember = useMemo(() => {
    const m = new Map<string, CapacityRow>()
    for (const c of capacity) {
      const key = (c.member_id || c.id) as string | undefined
      if (key) m.set(key, c)
    }
    return m
  }, [capacity])

  const roles = useMemo(() => {
    const set = new Set<string>()
    for (const t of team) if (t.role) set.add(t.role)
    return Array.from(set).sort()
  }, [team])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return team.filter((t) => {
      if (!showInactive && t.active === false) return false
      if (roleFilter && t.role !== roleFilter) return false
      if (q) {
        const hay = `${t.name} ${t.email ?? ''} ${t.role ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [team, search, roleFilter, showInactive])

  const stats = useMemo(() => {
    const totalActive = team.filter((t) => t.active !== false).length
    let activeLoad = 0
    let targetLoad = 0
    for (const c of capacity) {
      activeLoad += num(c.active_load)
      targetLoad += num(c.target_load)
    }
    if (targetLoad === 0) targetLoad = team.reduce((a, t) => a + num(t.target_load), 0)
    const util = targetLoad > 0 ? Math.round((activeLoad / targetLoad) * 100) : 0
    return { members: team.length, active: totalActive, activeLoad, targetLoad, util }
  }, [team, capacity])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(t: TeamMember) {
    setEditing(t)
    setForm({
      name: t.name ?? '',
      email: t.email ?? '',
      role: t.role ?? 'CSM',
      target_load: t.target_load != null ? String(t.target_load) : '',
      active: t.active !== false,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address')
      return
    }
    setBusy(true)
    setFormError(null)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      role: form.role || null,
      target_load: form.target_load.trim() ? Number(form.target_load) : null,
      active: form.active,
    }
    try {
      if (editing) {
        await api.updateTeamMember(editing.id, payload)
      } else {
        await api.createTeamMember(payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save member')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(t: TeamMember) {
    setBusy(true)
    try {
      await api.updateTeamMember(t.id, { active: !(t.active !== false) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update member')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(t: TeamMember) {
    if (!confirm(`Remove ${t.name} from the team?`)) return
    setBusy(true)
    try {
      await api.deleteTeamMember(t.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete member')
    } finally {
      setBusy(false)
    }
  }

  function loadInfo(t: TeamMember): { active: number; target: number; pct: number } {
    const c = capByMember.get(t.id)
    const active = c ? num(c.active_load) : 0
    const target = c ? num(c.target_load) : num(t.target_load)
    const pct = target > 0 ? Math.round((active / target) * 100) : active > 0 ? 100 : 0
    return { active, target, pct }
  }

  if (loading) return <PageSpinner label="Loading team..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Team</h1>
          <p className="mt-1 text-sm text-slate-400">
            Onboarding managers and CSMs, their roles, and active implementation load.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Member</Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button className="text-rose-200 hover:text-white" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members" value={stats.members} tone="teal" />
        <Stat label="Active" value={stats.active} tone="green" />
        <Stat label="Active load" value={`${stats.activeLoad} / ${stats.targetLoad}`} />
        <Stat
          label="Team utilization"
          value={`${stats.util}%`}
          tone={stats.util > 100 ? 'red' : stats.util > 85 ? 'amber' : 'green'}
        />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Search by name, email, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-teal-500"
            />
            Show inactive
          </label>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon="👥"
          title={team.length === 0 ? 'No team members yet' : 'No members match your filters'}
          description={
            team.length === 0
              ? 'Add onboarding managers and CSMs to assign them as tracker owners.'
              : 'Adjust your search or filters to see members.'
          }
          action={team.length === 0 ? <Button onClick={openCreate}>+ Add Member</Button> : undefined}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Role</TH>
                <TH>Capacity</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((t) => {
                const li = loadInfo(t)
                const over = li.target > 0 && li.active > li.target
                const barTone = over ? 'bg-rose-500' : li.pct > 85 ? 'bg-amber-500' : 'bg-teal-500'
                return (
                  <TR key={t.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-300">
                          {initials(t.name) || '?'}
                        </span>
                        <div>
                          <div className="font-medium text-slate-100">{t.name}</div>
                          {t.email && <div className="text-xs text-slate-500">{t.email}</div>}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {t.role ? (
                        <Badge tone={ROLE_TONE[t.role] ?? 'slate'}>{t.role}</Badge>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </TD>
                    <TD>
                      <div className="w-40">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 tabular-nums">
                            {li.active} / {li.target || '—'}
                          </span>
                          <span className={over ? 'text-rose-300' : 'text-slate-500'}>{li.pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${barTone}`}
                            style={{ width: `${Math.min(100, li.pct)}%` }}
                          />
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {t.active !== false ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="slate">Inactive</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} disabled={busy}>
                          {t.active !== false ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeMember(t)} disabled={busy}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Member' : 'Add Member'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={busy}>
              {busy ? 'Saving...' : editing ? 'Save Changes' : 'Add Member'}
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
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              placeholder="e.g. Jordan Lee"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              placeholder="jordan@company.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Target load</label>
              <input
                type="number"
                min={0}
                value={form.target_load}
                onChange={(e) => setForm({ ...form, target_load: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
                placeholder="Max active trackers"
              />
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-teal-500"
            />
            Active member
          </label>
          {editing && (
            <div className="border-t border-slate-800 pt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setModalOpen(false)
                  removeMember(editing)
                }}
                disabled={busy}
              >
                Delete Member
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
