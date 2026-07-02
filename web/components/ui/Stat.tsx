import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'teal' | 'green' | 'amber' | 'red'
  className?: string
}

const valueTones: Record<NonNullable<StatProps['tone']>, string> = {
  default: 'text-stone-100',
  teal: 'text-rose-300',
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-rose-300',
}

export function Stat({ label, value, sub, tone = 'default', className = '' }: StatProps) {
  return (
    <div className={`rounded-xl border border-stone-800 bg-stone-900 px-5 py-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${valueTones[tone]}`}>{value}</div>
      {sub != null && <div className="mt-1 text-xs text-stone-400">{sub}</div>}
    </div>
  )
}

export default Stat
