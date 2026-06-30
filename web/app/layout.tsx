import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OnboardingTimeToValueTracker',
  description: 'Track customer implementation journeys, measure time-to-value against SLAs, and catch stalled onboarding before it becomes churn.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
