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

interface ImportJob {
  id: string
  workspace_id?: string
  user_id?: string
  source?: string
  kind?: string
  status: string
  rows_total?: number
  rows_imported?: number
  errors?: unknown[] | null
  created_at?: string
}

const STATUS_TONE: Record<string, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  pending: 'slate',
  running: 'blue',
  processing: 'blue',
  completed: 'green',
  done: 'green',
  success: 'green',
  failed: 'red',
  error: 'red',
  partial: 'amber',
}

const CONNECTORS = [
  { source: 'salesforce', label: 'Salesforce', desc: 'Pull accounts and opportunities from Salesforce.' },
  { source: 'hubspot', label: 'HubSpot', desc: 'Sync companies and deals from HubSpot CRM.' },
  { source: 'gainsight', label: 'Gainsight', desc: 'Import customer-success accounts and health.' },
  { source: 'segment', label: 'Segment', desc: 'Stream product-usage events for milestone signals.' },
]

const SAMPLE_HEADERS = ['name', 'domain', 'segment', 'plan', 'arr', 'contract_start', 'target_go_live']
const SAMPLE_CSV = `name,domain,segment,plan,arr,contract_start,target_go_live
Acme Corp,acme.com,Enterprise,Enterprise,120000,2026-01-15,2026-03-01
Globex,globex.io,Mid-Market,Pro,48000,2026-02-01,2026-03-15
Initech,initech.com,SMB,Starter,12000,2026-02-10,2026-03-05`

function fmtDateTime(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) return { headers: [], rows: [], error: 'CSV needs a header row and at least one data row.' }
  const splitLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = !inQ
      } else if (c === ',' && !inQ) {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

export default function ImportsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [csvText, setCsvText] = useState('')
  const [csvError, setCsvError] = useState<string | null>(null)

  const [connectorBusy, setConnectorBusy] = useState<string | null>(null)
  const [seedOpen, setSeedOpen] = useState(false)

  const [viewJob, setViewJob] = useState<ImportJob | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getImportJobs()
      setJobs(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load import jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const parsed = useMemo(() => (csvText.trim() ? parseCsv(csvText) : null), [csvText])

  const stats = useMemo(() => {
    const total = jobs.length
    const imported = jobs.reduce((acc, j) => acc + (j.rows_imported ?? 0), 0)
    const failed = jobs.filter((j) => j.status === 'failed' || j.status === 'error').length
    const errored = jobs.reduce((acc, j) => acc + (Array.isArray(j.errors) ? j.errors.length : 0), 0)
    return { total, imported, failed, errored }
  }, [jobs])

  async function onFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    setCsvError(null)
  }

  async function runImport() {
    setCsvError(null)
    const res = parseCsv(csvText)
    if (res.error) {
      setCsvError(res.error)
      return
    }
    if (!res.headers.includes('name')) {
      setCsvError('CSV must include a "name" column.')
      return
    }
    if (res.rows.length === 0) {
      setCsvError('No data rows found.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const job = await api.importAccounts({ rows: res.rows })
      setCsvText('')
      const imported = (job && typeof job === 'object' && 'rows_imported' in job
        ? (job as ImportJob).rows_imported
        : undefined) ?? res.rows.length
      setNotice(`Imported ${imported} account${imported === 1 ? '' : 's'}.`)
      await load()
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function runConnector(source: string) {
    setConnectorBusy(source)
    setNotice(null)
    setError(null)
    try {
      await api.runConnector({ source })
      setNotice(`Connector job queued for ${source}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connector run failed')
    } finally {
      setConnectorBusy(null)
    }
  }

  async function runSeed() {
    setBusy(true)
    setNotice(null)
    setError(null)
    try {
      const res = await api.seedSample()
      setSeedOpen(false)
      let summary = 'Sample workspace provisioned.'
      if (res && typeof res === 'object' && 'counts' in res) {
        const counts = (res as { counts?: Record<string, number> }).counts
        if (counts) {
          summary =
            'Seeded: ' +
            Object.entries(counts)
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')
        }
      }
      setNotice(summary)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seeding failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading imports..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-100">Data &amp; Imports</h1>
          <p className="mt-1 text-sm text-stone-400">
            Bring accounts into the workspace via CSV, CRM connectors, or seed a full demo dataset.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setSeedOpen(true)}>
          Seed Sample Data
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button className="text-rose-200 hover:text-white" onClick={() => load()}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <span>{notice}</span>
          <button className="text-emerald-200 hover:text-white" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Import jobs" value={stats.total} tone="teal" />
        <Stat label="Rows imported" value={stats.imported} tone="green" />
        <Stat label="Failed jobs" value={stats.failed} tone={stats.failed > 0 ? 'red' : 'default'} />
        <Stat label="Row errors" value={stats.errored} tone={stats.errored > 0 ? 'amber' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">CSV Account Import</h2>
            <p className="mt-1 text-xs text-stone-500">
              Required column: <code className="text-rose-300">name</code>. Optional:{' '}
              {SAMPLE_HEADERS.filter((h) => h !== 'name').join(', ')}.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-xs font-medium text-stone-200 hover:bg-stone-700">
                Upload CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onFile(f)
                  }}
                />
              </label>
              <button
                className="text-xs text-rose-400 hover:text-rose-300"
                onClick={() => {
                  setCsvText(SAMPLE_CSV)
                  setCsvError(null)
                }}
              >
                Load example
              </button>
              {csvText && (
                <button
                  className="text-xs text-stone-500 hover:text-stone-300"
                  onClick={() => {
                    setCsvText('')
                    setCsvError(null)
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                setCsvError(null)
              }}
              rows={7}
              spellCheck={false}
              placeholder={SAMPLE_HEADERS.join(',') + '\n...'}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-xs text-stone-200 placeholder-stone-600 focus:border-rose-500 focus:outline-none"
            />
            {csvError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {csvError}
              </div>
            )}
            {parsed && !parsed.error && (
              <div className="rounded-lg border border-stone-800 bg-stone-950/60 p-3">
                <div className="mb-2 text-xs text-stone-400">
                  Preview: {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'},{' '}
                  {parsed.headers.length} columns
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-stone-500">
                      <tr>
                        {parsed.headers.map((h) => (
                          <th key={h} className="px-2 py-1 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800">
                      {parsed.rows.slice(0, 4).map((r, i) => (
                        <tr key={i}>
                          {parsed.headers.map((h) => (
                            <td key={h} className="px-2 py-1 text-stone-300">
                              {r[h] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 4 && (
                    <div className="mt-1 text-[11px] text-stone-600">
                      + {parsed.rows.length - 4} more rows
                    </div>
                  )}
                </div>
              </div>
            )}
            <Button onClick={runImport} disabled={busy || !csvText.trim()}>
              {busy ? 'Importing...' : 'Import Accounts'}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">CRM &amp; Product Connectors</h2>
            <p className="mt-1 text-xs text-stone-500">
              Queue a connector sync job. Each run is recorded in the job history below.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            {CONNECTORS.map((c) => (
              <div
                key={c.source}
                className="flex items-center justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/60 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-stone-100">{c.label}</div>
                  <div className="text-xs text-stone-500">{c.desc}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => runConnector(c.source)}
                  disabled={connectorBusy !== null}
                >
                  {connectorBusy === c.source ? 'Running...' : 'Run sync'}
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">Import History</h2>
        </CardHeader>
        {jobs.length === 0 ? (
          <CardBody>
            <EmptyState
              icon="📥"
              title="No import jobs yet"
              description="Upload a CSV, run a connector, or seed sample data to populate this history."
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH>Kind</TH>
                <TH>Status</TH>
                <TH className="text-right">Rows</TH>
                <TH className="text-right">Errors</TH>
                <TH>Created</TH>
                <TH className="text-right" />
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => {
                const errCount = Array.isArray(j.errors) ? j.errors.length : 0
                return (
                  <TR key={j.id}>
                    <TD className="font-medium text-stone-100">{j.source || '—'}</TD>
                    <TD className="capitalize">{j.kind || '—'}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[j.status] ?? 'slate'}>{j.status}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {j.rows_imported ?? 0}
                      {j.rows_total != null && (
                        <span className="text-stone-500"> / {j.rows_total}</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {errCount > 0 ? <span className="text-rose-300">{errCount}</span> : '0'}
                    </TD>
                    <TD className="text-xs text-stone-400">{fmtDateTime(j.created_at)}</TD>
                    <TD className="text-right">
                      {errCount > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setViewJob(j)}>
                          View errors
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={seedOpen}
        onClose={() => setSeedOpen(false)}
        title="Seed Sample Workspace"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSeedOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={runSeed} disabled={busy}>
              {busy ? 'Seeding...' : 'Seed Sample Data'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-stone-300">
          <p>
            This provisions a complete demo dataset: journey templates, stages, accounts, active trackers
            with milestone history, blockers, and activity. Use it to explore the platform with realistic
            data.
          </p>
          <p className="text-xs text-stone-500">
            Existing data is not deleted. Seeded records are added to your current workspace.
          </p>
        </div>
      </Modal>

      <Modal
        open={viewJob !== null}
        onClose={() => setViewJob(null)}
        title="Import Errors"
        className="max-w-2xl"
        footer={
          <Button variant="secondary" onClick={() => setViewJob(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-stone-500">
            {viewJob?.source} · {fmtDateTime(viewJob?.created_at)}
          </div>
          {Array.isArray(viewJob?.errors) && viewJob.errors.length > 0 ? (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {viewJob.errors.map((err, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 font-mono text-xs text-rose-300"
                >
                  {typeof err === 'string' ? err : JSON.stringify(err)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">No errors recorded for this job.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
