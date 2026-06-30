import Link from 'next/link'

const features = [
  {
    title: 'Onboarding Journey Templates',
    body: 'Build versioned milestone journeys per product line and segment, with target days, owner roles, and exit criteria. Designate first-value and go-live milestones for clean TTV math.',
  },
  {
    title: 'Per-Account Trackers',
    body: 'Spin up a live tracker from any template. Watch current milestone, days in stage, total elapsed, and a recomputed projected go-live date as work advances.',
  },
  {
    title: 'ARR-Weighted Stall Detector',
    body: 'Rank overdue implementations by a composite score of ARR and days past target. Watch / at-risk / critical bands roll up the exact dollars at risk.',
  },
  {
    title: 'Time-to-Value Analytics',
    body: 'Median and p75/p90 days-to-first-value and days-to-go-live, cohort breakdowns by start month and segment, a stage funnel, and trend over time.',
  },
  {
    title: 'Blocker Log & Systemic Friction',
    body: 'Log blockers by category and severity against any milestone, then see friction aggregated by category and stage to expose what slips every single time.',
  },
  {
    title: 'Implementation Manager Scorecards',
    body: 'On-time go-live rate, median TTV, active load, stalled count, and ARR under management per manager, plus a capacity view against target load.',
  },
  {
    title: 'SLA Policies & Attainment',
    body: 'Define target days-to-first-value and days-to-go-live per segment or template with grace periods, then report attainment and surface every breach.',
  },
  {
    title: 'Customer-Facing Shared Plans',
    body: 'Generate a read-only onboarding plan from any tracker and share it via a token link. Milestones, owners, target dates, and progress, no login required.',
  },
  {
    title: 'Activity Timeline & Notes',
    body: 'Every advance, blocker, status change, and owner change lands on a filterable timeline. Threaded notes, pins, and an internal vs customer-visible flag.',
  },
]

const steps = [
  { n: '01', title: 'Define your journey', body: 'Pick a starter template (SMB, Mid-Market, Enterprise) or build your own stage library and milestones.' },
  { n: '02', title: 'Track every account', body: 'Create a tracker per customer from a template version. Advance milestones, log blockers, assign managers.' },
  { n: '03', title: 'Catch stalls early', body: 'The detector ranks at-risk ARR and the analytics layer baselines your real TTV so you can coach and improve.' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-sm font-black text-slate-950">O</span>
          <span className="text-base font-bold tracking-tight">OnboardingTimeToValueTracker</span>
        </span>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/pricing" className="text-slate-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-teal-500 px-4 py-2 font-medium text-slate-950 hover:bg-teal-400">Get Started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-300">
          Customer Success operations, measured
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
          See which implementations are stuck
          <span className="block text-teal-400">before they become churn.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          OnboardingTimeToValueTracker tracks every new B2B SaaS customer through their implementation journey, measures
          time-to-value against your SLAs, and flags stalled accounts ranked by the ARR at risk.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="rounded-lg bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400">
            Start free
          </Link>
          <Link href="/auth/sign-in" className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800">
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">Every feature is free. Sample data seeds in one click.</p>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold">Onboarding out of spreadsheets is a churn risk</h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-slate-400">
            Slow or stalled onboarding is one of the strongest leading indicators of first-year churn, and it delays
            revenue recognition. Yet most teams run implementation out of tools never designed to measure time-to-value.
          </p>
          <ul className="mx-auto mt-8 grid max-w-3xl gap-3 text-sm text-slate-400 sm:grid-cols-2">
            <li className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">No at-a-glance view of which implementations are stuck or how much ARR is at risk.</li>
            <li className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">No statistically rigorous baseline for time-to-first-value or days-to-go-live.</li>
            <li className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">Blockers tracked ad hoc, so systemic friction stays invisible.</li>
            <li className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">Manager performance is anecdotal, so coaching and capacity planning are guesswork.</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold">Everything you need to run implementation as a system</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Journey templates, live trackers, an ARR-weighted stall detector, and a deep TTV analytics layer.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="font-semibold text-teal-300">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="text-3xl font-black text-teal-500/40">{s.n}</div>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Stop guessing why onboarding slips.</h2>
        <p className="mt-4 text-slate-400">
          Spin up a demo workspace with sample templates, accounts, and trackers in one click and start measuring today.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="rounded-lg bg-teal-500 px-6 py-3 font-semibold text-slate-950 hover:bg-teal-400">
            Create your free account
          </Link>
          <Link href="/pricing" className="rounded-lg border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800">
            See pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-600">
        <p>OnboardingTimeToValueTracker — Customer implementation time-to-value tracking.</p>
      </footer>
    </main>
  )
}
