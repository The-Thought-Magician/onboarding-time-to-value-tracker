'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const included = [
  'Unlimited journey templates & versions',
  'Unlimited accounts and implementation trackers',
  'ARR-weighted stall detector with severity bands',
  'Full time-to-value analytics (p50/p75/p90, cohorts, trend, stage funnel)',
  'Blocker log and systemic friction view',
  'Implementation manager scorecards & capacity',
  'SLA policies and attainment reporting',
  'Customer-facing shared onboarding plans',
  'Activity timeline, notes, tasks, and audit log',
  'CSV import, connector stubs, and one-click sample data',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const plan = await api.getBillingPlan()
        if (!cancelled) setStripeEnabled(Boolean(plan?.stripeEnabled))
      } catch {
        // not signed in or billing unavailable; free plan stands regardless
      }
    })()
    return () => { cancelled = true }
  }, [])

  const upgrade = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await api.startCheckout()
      if (res?.url) { window.location.href = res.url; return }
      setMsg('Billing is not configured. Everything is already free, so just create an account.')
    } catch {
      setMsg('Billing is not configured. Everything is already free, so just create an account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-sm font-black text-slate-950">O</span>
          <span className="text-base font-bold tracking-tight">OnboardingTimeToValueTracker</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-teal-500 px-4 py-2 font-medium text-slate-950 hover:bg-teal-400">Get Started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Simple pricing: it&apos;s free</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Every feature of OnboardingTimeToValueTracker is free for signed-in users. Stripe billing is wired but
          optional, so the platform stays fully usable without any payment configured.
        </p>

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-teal-500/30 bg-slate-900 p-8 text-left">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Free</h2>
            <div>
              <span className="text-4xl font-extrabold">$0</span>
              <span className="text-slate-500">/mo</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-400">All features, no limits, no card required.</p>
          <ul className="mt-6 space-y-2 text-sm">
            {included.map((f) => (
              <li key={f} className="flex gap-2 text-slate-300">
                <span className="text-teal-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/auth/sign-up"
            className="mt-8 block rounded-lg bg-teal-500 px-6 py-3 text-center font-semibold text-slate-950 hover:bg-teal-400"
          >
            Create your free account
          </Link>

          {stripeEnabled && (
            <button
              onClick={upgrade}
              disabled={busy}
              className="mt-3 block w-full rounded-lg border border-slate-700 px-6 py-3 text-center font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? 'Starting checkout...' : 'Optional: support development'}
            </button>
          )}
          {msg && <p className="mt-3 text-center text-xs text-slate-400">{msg}</p>}
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-600">
        <p>OnboardingTimeToValueTracker — Customer implementation time-to-value tracking.</p>
      </footer>
    </main>
  )
}
