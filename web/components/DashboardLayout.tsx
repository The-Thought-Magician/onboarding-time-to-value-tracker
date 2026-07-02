'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'

interface NavItem {
  label: string
  href: string
  icon: string
}
interface NavSection {
  title: string
  items: NavItem[]
}

const ICONS: Record<string, string> = {
  dashboard: 'M3 13h4v7H3v-7Zm7-9h4v16h-4V4Zm7 5h4v11h-4V9Z',
  accounts: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  trackers: 'M4 6h16M4 12h10M4 18h6M17 15l3 3-3 3',
  stall: 'M12 3l9 16H3l9-16Zm0 6v4m0 3h.01',
  risk: 'M12 3l9 16H3l9-16Zm0 6v4m0 3h.01',
  blockers: 'M6 6l12 12M18 6L6 18',
  tasks: 'M5 12l4 4 10-10',
  templates: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  stages: 'M4 6h16M4 12h16M4 18h16',
  sla: 'M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4Z',
  analytics: 'M3 3v18h18M8 17V9m5 8V5m5 12v-6',
  scorecards: 'M12 2l2.7 5.9 6.3.6-4.7 4.3 1.4 6.2L12 15.9 6.3 19l1.4-6.2L3 8.5l6.3-.6L12 2Z',
  reports: 'M6 4h9l3 3v13H6V4Zm9 0v3h3M9 12h6M9 16h6',
  notifications: 'M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 10a2 2 0 0 0 4 0',
  team: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 8a6 6 0 0 1 12 0M17 8a4 4 0 0 1 0 8m2 4a6 6 0 0 0-3-5.2',
  imports: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  settings: 'M10.3 2h3.4l.6 2.6a7.9 7.9 0 0 1 2 1.2l2.6-.9 1.7 3-2 1.8a8 8 0 0 1 0 2.3l2 1.8-1.7 3-2.6-.9a7.9 7.9 0 0 1-2 1.2L13.7 22h-3.4l-.6-2.6a7.9 7.9 0 0 1-2-1.2l-2.6.9-1.7-3 2-1.8a8 8 0 0 1 0-2.3l-2-1.8 1.7-3 2.6.9a7.9 7.9 0 0 1 2-1.2L10.3 2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
}

const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard' }],
  },
  {
    title: 'Implementations',
    items: [
      { label: 'Accounts', href: '/dashboard/accounts', icon: 'accounts' },
      { label: 'Trackers', href: '/dashboard/trackers', icon: 'trackers' },
      { label: 'Stall Detector', href: '/dashboard/stall-detector', icon: 'stall' },
      { label: 'At-Risk Queue', href: '/dashboard/risk', icon: 'risk' },
      { label: 'Blockers', href: '/dashboard/blockers', icon: 'blockers' },
      { label: 'Tasks', href: '/dashboard/tasks', icon: 'tasks' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Journey Templates', href: '/dashboard/templates', icon: 'templates' },
      { label: 'Stage Library', href: '/dashboard/stages', icon: 'stages' },
      { label: 'SLA Policies', href: '/dashboard/sla', icon: 'sla' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Analytics', href: '/dashboard/analytics', icon: 'analytics' },
      { label: 'Scorecards', href: '/dashboard/scorecards', icon: 'scorecards' },
      { label: 'Reports', href: '/dashboard/reports', icon: 'reports' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { label: 'Notifications', href: '/dashboard/notifications', icon: 'notifications' },
      { label: 'Team', href: '/dashboard/team', icon: 'team' },
      { label: 'Data & Imports', href: '/dashboard/imports', icon: 'imports' },
      { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

function Icon({ name, className }: { name: string; className?: string }) {
  const d = ICONS[name] || ICONS.dashboard
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('Workspace')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      const u = s.data.user as { name?: string; email?: string }
      setWorkspaceName(u.name || u.email || 'Workspace')
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <div className="flex items-center gap-3 text-stone-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-700 border-t-rose-400" />
          <span className="text-sm">Loading workspace...</span>
        </div>
      </div>
    )
  }

  // Icon-only rail: persistent, collapsed to icons with hover tooltips
  const rail = (
    <nav className="group/rail flex h-full w-16 flex-col items-center border-r border-stone-800 bg-stone-900 py-4">
      <Link href="/dashboard" className="mb-6 flex h-9 w-9 items-center justify-center rounded-md bg-rose-500 text-sm font-black text-stone-950">
        O
      </Link>
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {NAV.flatMap((section) => section.items).map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <div key={item.href} className="group relative w-full px-2">
              <Link
                href={item.href}
                aria-label={item.label}
                className={`flex h-10 w-full items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
              </Link>
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-100 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </nav>
  )

  const mobileNav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-stone-800 px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500 text-sm font-black text-stone-950">O</span>
        <span className="text-sm font-bold tracking-tight text-stone-100">OnboardingTimeToValueTracker</span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV.map((section) => (
          <div key={section.title}>
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-600">{section.title}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-rose-500/15 font-medium text-rose-300'
                          : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
                      }`}
                    >
                      <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-stone-950">
      <aside className="hidden shrink-0 lg:block">
        {rail}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/70" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-stone-800 bg-stone-900">
            {mobileNav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-800 bg-stone-900/60 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="text-stone-400 hover:text-stone-100 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-stone-300">{workspaceName}</span>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-800 hover:text-stone-100"
          >
            Sign out
          </button>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
