'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Account {
  id: string
  name: string
  domain?: string | null
  plan?: string | null
  segment_id?: string | null
  segment_name?: string | null
  health?: string | null
  has_tracker?: boolean
  tracker_id?: string | null
}

interface Template {
  id: string
  name: string
  description?: string | null
  segment_id?: string | null
  product_id?: string | null
  total_target_days?: number | null
  status?: string | null
  is_default?: boolean
  version?: number | null
}

interface TeamMember {
  id: string
  name?: string | null
  role?: string | null
  active?: boolean
}

const STEPS = ['Account', 'Template', 'Owner & start', 'Review'] as const

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function NewTrackerPage() {
  const router = useRouter()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  const [accountId, setAccountId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [accountQuery, setAccountQuery] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [a, t, m] = await Promise.allSettled([api.getAccounts(), api.getTemplates(), api.getTeam()])
    if (a.status === 'fulfilled') setAccounts(Array.isArray(a.value) ? a.value : a.value?.accounts ?? [])
    else setError(a.reason instanceof Error ? a.reason.message : 'Failed to load accounts')
    if (t.status === 'fulfilled') setTemplates(Array.isArray(t.value) ? t.value : t.value?.templates ?? [])
    if (m.status === 'fulfilled') setTeam(Array.isArray(m.value) ? m.value : m.value?.team ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Pre-select a sensible default template once an account is chosen.
  useEffect(() => {
    if (!accountId || templateId) return
    const acc = accounts.find((a) => a.id === accountId)
    const bySegment = acc?.segment_id ? templates.find((t) => t.segment_id === acc.segment_id) : undefined
    const def = templates.find((t) => t.is_default)
    const pick = bySegment || def || templates[0]
    if (pick) setTemplateId(pick.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId])
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId])
  const selectedManager = useMemo(() => team.find((m) => m.id === managerId), [team, managerId])

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) =>
      [a.name, a.domain, a.segment_name].some((s) => (s || '').toLowerCase().includes(q)),
    )
  }, [accounts, accountQuery])

  const canNext =
    (step === 0 && !!accountId) ||
    (step === 1 && !!templateId) ||
    step === 2 ||
    step === 3

  async function submit() {
    if (!accountId || !templateId) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body: Record<string, unknown> = {
        account_id: accountId,
        template_id: templateId,
      }
      if (managerId) body.manager_id = managerId
      if (startedAt) body.started_at = startedAt
      const created = await api.createTracker(body)
      const tracker = created?.tracker ?? created
      if (tracker?.id) {
        router.push(`/dashboard/trackers/${tracker.id}`)
      } else {
        router.push('/dashboard/trackers')
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create tracker')
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner label="Loading wizard..." />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Link href="/dashboard/trackers" className="hover:text-rose-300">
            Trackers
          </Link>
          <span>/</span>
          <span className="text-stone-300">New</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-100">Start an onboarding tracker</h1>
        <p className="mt-1 text-sm text-stone-400">
          Pick an account and a journey template. We snapshot the milestones so changes to the template
          never disturb a live onboarding.
        </p>
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                i === step
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : i < step
                    ? 'border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700'
                    : 'border-stone-800 bg-stone-900 text-stone-600'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  i <= step ? 'bg-rose-500 text-stone-950' : 'bg-stone-800 text-stone-500'
                }`}
              >
                {i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-stone-700">→</span>}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <Card>
        <CardBody className="space-y-4">
          {/* Step 0 — Account */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-200">Choose an account</h2>
                <Link href="/dashboard/accounts" className="text-xs text-rose-400 hover:text-rose-300">
                  Manage accounts
                </Link>
              </div>
              {accounts.length === 0 ? (
                <EmptyState
                  title="No accounts yet"
                  description="Create an account before starting a tracker."
                  action={
                    <Link href="/dashboard/accounts">
                      <Button>Go to accounts</Button>
                    </Link>
                  }
                />
              ) : (
                <>
                  <input
                    className="input"
                    placeholder="Search accounts..."
                    value={accountQuery}
                    onChange={(e) => setAccountQuery(e.target.value)}
                  />
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {filteredAccounts.length === 0 && (
                      <p className="py-4 text-center text-sm text-stone-500">No accounts match.</p>
                    )}
                    {filteredAccounts.map((a) => {
                      const selected = a.id === accountId
                      const hasTracker = a.has_tracker || !!a.tracker_id
                      return (
                        <button
                          key={a.id}
                          onClick={() => setAccountId(a.id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                            selected
                              ? 'border-rose-500/50 bg-rose-500/10'
                              : 'border-stone-800 bg-stone-950/40 hover:border-stone-700'
                          }`}
                        >
                          <div>
                            <div className="font-medium text-stone-100">{a.name}</div>
                            <div className="text-xs text-stone-500">
                              {a.domain || 'no domain'}
                              {a.segment_name ? ` · ${a.segment_name}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasTracker && <Badge tone="amber">has tracker</Badge>}
                            {selected && <Badge tone="teal">selected</Badge>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 1 — Template */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-200">Choose a journey template</h2>
                <Link href="/dashboard/templates" className="text-xs text-rose-400 hover:text-rose-300">
                  Manage templates
                </Link>
              </div>
              {templates.length === 0 ? (
                <EmptyState
                  title="No templates yet"
                  description="Create a journey template with milestones first."
                  action={
                    <Link href="/dashboard/templates">
                      <Button>Go to templates</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((t) => {
                    const selected = t.id === templateId
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        className={`flex flex-col rounded-lg border px-4 py-3 text-left transition-colors ${
                          selected
                            ? 'border-rose-500/50 bg-rose-500/10'
                            : 'border-stone-800 bg-stone-950/40 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-stone-100">{t.name}</span>
                          {t.is_default && <Badge tone="blue">default</Badge>}
                        </div>
                        {t.description && (
                          <span className="mt-1 line-clamp-2 text-xs text-stone-500">{t.description}</span>
                        )}
                        <span className="mt-2 text-xs text-stone-400">
                          {t.total_target_days != null ? `Target ${t.total_target_days} days` : 'No target set'}
                          {t.version != null ? ` · v${t.version}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Owner & start date */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-stone-200">Owner &amp; start date</h2>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-400">Onboarding manager</span>
                <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {team
                    .filter((m) => m.active !== false)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                        {m.role ? ` (${m.role})` : ''}
                      </option>
                    ))}
                </select>
                {team.length === 0 && (
                  <span className="mt-1 block text-xs text-stone-500">
                    No team members yet — you can assign one later from the tracker.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-400">Start date</span>
                <input
                  className="input"
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                />
                <span className="mt-1 block text-xs text-stone-500">
                  Time-to-value is measured from this date.
                </span>
              </label>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-stone-200">Review &amp; create</h2>
              <div className="divide-y divide-stone-800 rounded-lg border border-stone-800">
                <ReviewRow label="Account" value={selectedAccount?.name || '—'} onEdit={() => setStep(0)} />
                <ReviewRow
                  label="Template"
                  value={selectedTemplate?.name || '—'}
                  hint={
                    selectedTemplate?.total_target_days != null
                      ? `target ${selectedTemplate.total_target_days} days`
                      : undefined
                  }
                  onEdit={() => setStep(1)}
                />
                <ReviewRow
                  label="Manager"
                  value={selectedManager?.name || 'Unassigned'}
                  onEdit={() => setStep(2)}
                />
                <ReviewRow label="Start date" value={fmtDate(startedAt)} onEdit={() => setStep(2)} />
              </div>
              {selectedAccount && (selectedAccount.has_tracker || selectedAccount.tracker_id) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                  This account already appears to have a tracker. Creating another may be rejected
                  (one tracker per account).
                </div>
              )}
              {submitError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? router.push('/dashboard/trackers') : setStep(step - 1))}
          disabled={submitting}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting || !accountId || !templateId}>
            {submitting ? 'Creating...' : 'Create tracker'}
          </Button>
        )}
      </div>

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

function ReviewRow({
  label,
  value,
  hint,
  onEdit,
}: {
  label: string
  value: string
  hint?: string
  onEdit: () => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
        <div className="mt-0.5 text-stone-100">
          {value}
          {hint && <span className="ml-2 text-xs text-stone-500">{hint}</span>}
        </div>
      </div>
      <button onClick={onEdit} className="text-xs text-rose-400 hover:text-rose-300">
        Edit
      </button>
    </div>
  )
}
