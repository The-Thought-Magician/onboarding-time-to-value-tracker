'use client'

import { useEffect, useState, use } from 'react'
import api from '@/lib/api'
import Badge from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'

interface Milestone {
  id: string
  name: string
  category?: string
  position?: number
  target_days?: number
  status?: string
  is_first_value?: boolean
  is_go_live?: boolean
  started_at?: string | null
  completed_at?: string | null
}

interface PlanData {
  plan: {
    id: string
    title?: string
    active?: boolean
    created_at?: string
    snapshot?: Record<string, unknown>
  }
  milestones: Milestone[]
  account: {
    id: string
    name?: string
    plan?: string
    target_go_live?: string | null
    health?: string
  } | null
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusTone(s?: string): 'green' | 'teal' | 'amber' | 'slate' | 'red' {
  switch ((s || '').toLowerCase()) {
    case 'completed':
    case 'done':
      return 'green'
    case 'in_progress':
    case 'active':
    case 'started':
      return 'teal'
    case 'blocked':
      return 'red'
    case 'at_risk':
      return 'amber'
    default:
      return 'slate'
  }
}

function statusLabel(s?: string): string {
  if (!s) return 'Not started'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PublicPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await api.getPublicPlan(token)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This plan link is invalid or has been revoked.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-100">
        <PageSpinner label="Loading onboarding plan..." />
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mb-4 text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-stone-100">Plan unavailable</h1>
          <p className="mt-2 text-sm text-stone-400">{error || 'This onboarding plan could not be found.'}</p>
        </div>
      </main>
    )
  }

  const milestones = [...(data.milestones || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const total = milestones.length
  const completed = milestones.filter((m) => (m.status || '').toLowerCase() === 'completed' || (m.status || '').toLowerCase() === 'done').length
  const pct = total ? Math.round((completed / total) * 100) : 0
  const firstValue = milestones.find((m) => m.is_first_value)
  const goLive = milestones.find((m) => m.is_go_live)
  const accountName = data.account?.name || (data.plan.snapshot?.account_name as string) || 'Your onboarding'

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <header className="border-b border-stone-800 bg-stone-900/60">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-500 text-base font-black text-stone-950">O</span>
          <div>
            <div className="text-sm font-semibold text-stone-100">{data.plan.title || 'Onboarding Plan'}</div>
            <div className="text-xs text-stone-500">Shared by your customer success team</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <section className="rounded-2xl border border-stone-800 bg-stone-900 p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-100">{accountName}</h1>
              <p className="mt-1 text-sm text-stone-400">Your path to first value and go-live.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.account?.plan && <Badge tone="blue">{data.account.plan}</Badge>}
                {data.account?.health && <Badge tone={statusTone(data.account.health)}>{statusLabel(data.account.health)} health</Badge>}
                {data.account?.target_go_live && <Badge tone="teal">Target go-live {fmtDate(data.account.target_go_live)}</Badge>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-extrabold tabular-nums text-rose-300">{pct}%</div>
              <div className="text-xs uppercase tracking-wide text-stone-500">Complete</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-stone-500">
              <span>{completed} of {total} milestones complete</span>
              <span>{total - completed} remaining</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-stone-800 bg-stone-950/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-stone-500">First value milestone</div>
              <div className="mt-1 text-sm font-medium text-stone-200">{firstValue?.name || 'Not defined'}</div>
              {firstValue && (
                <div className="mt-1 text-xs text-stone-500">
                  {firstValue.completed_at ? `Reached ${fmtDate(firstValue.completed_at)}` : statusLabel(firstValue.status)}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-950/40 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-stone-500">Go-live milestone</div>
              <div className="mt-1 text-sm font-medium text-stone-200">{goLive?.name || 'Not defined'}</div>
              {goLive && (
                <div className="mt-1 text-xs text-stone-500">
                  {goLive.completed_at ? `Reached ${fmtDate(goLive.completed_at)}` : statusLabel(goLive.status)}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-400">Milestones</h2>
          {milestones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-800 bg-stone-900/40 px-6 py-12 text-center text-sm text-stone-400">
              No milestones have been published for this plan yet.
            </div>
          ) : (
            <ol className="relative space-y-3 border-l border-stone-800 pl-6">
              {milestones.map((m) => {
                const done = (m.status || '').toLowerCase() === 'completed' || (m.status || '').toLowerCase() === 'done'
                return (
                  <li key={m.id} className="relative">
                    <span
                      className={`absolute -left-[31px] top-2 h-3.5 w-3.5 rounded-full border-2 ${
                        done ? 'border-rose-400 bg-rose-400' : (m.status || '').toLowerCase() === 'blocked' ? 'border-rose-400 bg-rose-500/40' : 'border-stone-600 bg-stone-900'
                      }`}
                    />
                    <div className="rounded-xl border border-stone-800 bg-stone-900 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-stone-100">{m.name}</span>
                          {m.is_first_value && <Badge tone="teal">First value</Badge>}
                          {m.is_go_live && <Badge tone="blue">Go-live</Badge>}
                          {m.category && <Badge tone="slate">{m.category}</Badge>}
                        </div>
                        <Badge tone={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone-500">
                        {typeof m.target_days === 'number' && <span>Target: {m.target_days} days</span>}
                        {m.started_at && <span>Started {fmtDate(m.started_at)}</span>}
                        {m.completed_at && <span className="text-rose-400">Completed {fmtDate(m.completed_at)}</span>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <footer className="mt-12 border-t border-stone-800 pt-6 text-center text-xs text-stone-600">
          This is a live, read-only view of your onboarding plan. Reach out to your customer success contact with any questions.
        </footer>
      </div>
    </main>
  )
}
