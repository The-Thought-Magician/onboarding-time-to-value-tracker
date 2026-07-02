import Link from 'next/link'

const features = [
  {
    title: 'Onboarding Journey Templates',
    body: 'Codify your implementation methodology once, per product line and segment, with versioned milestones, target days, owner roles, and exit criteria. First-value and go-live milestones are declared explicitly, so your time-to-value math is defensible from day one.',
  },
  {
    title: 'Per-Account Trackers',
    body: 'Instantiate a governed tracker from any template for every new engagement. Current milestone, days in stage, cumulative elapsed time, and a continuously recomputed projected go-live date are always current, without a status meeting.',
  },
  {
    title: 'ARR-Weighted Stall Detector',
    body: 'Overdue implementations are ranked by a composite of contract value and days past target, so your team\'s attention is allocated to the revenue that is genuinely at risk, not simply the oldest ticket in the queue.',
  },
  {
    title: 'Time-to-Value Analytics',
    body: 'Median and p75/p90 days-to-first-value and days-to-go-live, cohort analysis by start month and segment, a stage-by-stage funnel, and trend lines over time, all built for the reporting cadence a leadership team expects.',
  },
  {
    title: 'Blocker Log & Systemic Friction',
    body: 'Record every blocker by category and severity against the milestone it stalled. Aggregated views surface the friction that recurs across your book of business, turning anecdote into an evidence-backed remediation plan.',
  },
  {
    title: 'Implementation Manager Scorecards',
    body: 'On-time go-live rate, median time-to-value, active caseload, stalled-account count, and ARR under management, per manager, with a capacity view benchmarked against target load, informing coaching and staffing decisions alike.',
  },
  {
    title: 'SLA Policies & Attainment',
    body: 'Define target days-to-first-value and days-to-go-live by segment or template, with grace periods that reflect how your organization actually operates, then report attainment and surface every breach before it reaches a QBR.',
  },
  {
    title: 'Customer-Facing Shared Plans',
    body: 'Generate a read-only onboarding plan from any tracker and share it by token link. Milestones, owners, target dates, and progress are visible to your customer without requiring a login, reinforcing transparency at a pivotal stage of the relationship.',
  },
  {
    title: 'Activity Timeline & Notes',
    body: 'Every advance, blocker, status change, and owner reassignment is captured on a filterable audit timeline, with threaded notes, pinning, and an explicit internal versus customer-visible distinction.',
  },
]

const steps = [
  { n: '01', title: 'Codify your methodology', body: 'Start from an SMB, Mid-Market, or Enterprise template, or define your own stage library and milestone set to reflect how your organization delivers.' },
  { n: '02', title: 'Govern every engagement', body: 'Instantiate a tracker per customer from a template version. Advance milestones, log blockers, and assign implementation managers with full traceability.' },
  { n: '03', title: 'Intervene before revenue is at risk', body: 'The stall detector ranks exposure by ARR, and the analytics layer establishes a defensible baseline for time-to-value, giving your team the evidence to coach, staff, and act early.' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500 text-sm font-black text-stone-950">O</span>
          <span className="text-base font-bold tracking-tight">OnboardingTimeToValueTracker</span>
        </span>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/pricing" className="text-stone-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-500 px-4 py-2 font-medium text-stone-950 hover:bg-rose-400">Get Started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-300">
          For Customer Success and Implementation leaders
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Know which implementations are at risk
          <span className="block text-rose-400">before your renewal conversation does.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-400">
          OnboardingTimeToValueTracker gives Customer Success and Implementation teams a governed system of record for
          every new account&#39;s onboarding journey, measuring time-to-value against your SLAs and prioritizing
          stalled accounts by the ARR genuinely at risk.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-500 px-6 py-3 font-semibold text-stone-950 hover:bg-rose-400">
            Start your free workspace
          </Link>
          <Link href="/auth/sign-in" className="rounded-lg border border-stone-700 px-6 py-3 font-semibold text-stone-200 hover:bg-stone-800">
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-xs text-stone-500">Every capability is included at no cost. Sample data is available on request.</p>
      </section>

      <section className="border-y border-stone-800 bg-stone-900/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold">Onboarding run out of spreadsheets is an unmanaged churn exposure</h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-stone-400">
            Slow or stalled onboarding is among the strongest leading indicators of first-year churn, and it defers
            revenue recognition along the way. Most organizations still run implementation through tools that were
            never built to measure time-to-value, which leaves this exposure effectively unmanaged.
          </p>
          <ul className="mx-auto mt-8 grid max-w-3xl gap-3 text-sm text-stone-400 sm:grid-cols-2">
            <li className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">No consolidated view of which implementations are stalled or how much ARR sits behind them.</li>
            <li className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">No statistically defensible baseline for time-to-first-value or days-to-go-live.</li>
            <li className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">Blockers tracked ad hoc, leaving systemic friction invisible to leadership.</li>
            <li className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-3">Manager performance assessed anecdotally, leaving coaching and capacity planning to guesswork.</li>
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold">The operating system for a disciplined implementation practice</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-stone-400">
          Journey templates, governed trackers, an ARR-weighted stall detector, and a rigorous time-to-value analytics
          layer, assembled to give leadership and practitioners a shared source of truth.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900 p-6">
              <h3 className="font-semibold text-rose-300">{f.title}</h3>
              <p className="mt-2 text-sm text-stone-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-800 bg-stone-900/40">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="text-3xl font-black text-rose-500/40">{s.n}</div>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-stone-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Bring evidence, not anecdote, to your next onboarding review.</h2>
        <p className="mt-4 text-stone-400">
          Provision a workspace with sample templates, accounts, and trackers and see your first defensible
          time-to-value baseline within the hour.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-500 px-6 py-3 font-semibold text-stone-950 hover:bg-rose-400">
            Create your workspace
          </Link>
          <Link href="/pricing" className="rounded-lg border border-stone-700 px-6 py-3 font-semibold text-stone-200 hover:bg-stone-800">
            Review pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-800 py-8 text-center text-sm text-stone-600">
        <p>OnboardingTimeToValueTracker — governed time-to-value tracking for B2B implementation teams.</p>
      </footer>
    </main>
  )
}
