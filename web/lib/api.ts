// Same-origin relative calls to /api/proxy/* (proxy injects X-User-Id).
// Path after /api/proxy/ maps 1:1 to the backend path after /api/v1/.

type Q = Record<string, string | number | boolean | undefined | null>

function qs(params?: Q): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

const get = (path: string) => http(path)
const post = (path: string, body?: unknown) =>
  http(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const put = (path: string, body?: unknown) =>
  http(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const del = (path: string) => http(path, { method: 'DELETE' })

const P = '/api/proxy'

const api = {
  // Workspace / overview
  getWorkspace: () => get(`${P}/workspaces/current`),
  updateWorkspace: (body: unknown) => put(`${P}/workspaces/current`, body),
  getOverview: () => get(`${P}/workspaces/overview`),

  // Segments
  getSegments: () => get(`${P}/segments`),
  getSegment: (id: string) => get(`${P}/segments/${id}`),
  createSegment: (body: unknown) => post(`${P}/segments`, body),
  updateSegment: (id: string, body: unknown) => put(`${P}/segments/${id}`, body),
  deleteSegment: (id: string) => del(`${P}/segments/${id}`),

  // Products
  getProducts: () => get(`${P}/products`),
  createProduct: (body: unknown) => post(`${P}/products`, body),
  updateProduct: (id: string, body: unknown) => put(`${P}/products/${id}`, body),
  deleteProduct: (id: string) => del(`${P}/products/${id}`),

  // Stages
  getStages: () => get(`${P}/stages`),
  getStage: (id: string) => get(`${P}/stages/${id}`),
  createStage: (body: unknown) => post(`${P}/stages`, body),
  updateStage: (id: string, body: unknown) => put(`${P}/stages/${id}`, body),
  deleteStage: (id: string) => del(`${P}/stages/${id}`),

  // Templates
  getTemplates: () => get(`${P}/templates`),
  getTemplate: (id: string) => get(`${P}/templates/${id}`),
  createTemplate: (body: unknown) => post(`${P}/templates`, body),
  updateTemplate: (id: string, body: unknown) => put(`${P}/templates/${id}`, body),
  cloneTemplate: (id: string, body?: unknown) => post(`${P}/templates/${id}/clone`, body),
  deleteTemplate: (id: string) => del(`${P}/templates/${id}`),
  addTemplateMilestone: (id: string, body: unknown) => post(`${P}/templates/${id}/milestones`, body),
  updateTemplateMilestone: (id: string, mid: string, body: unknown) => put(`${P}/templates/${id}/milestones/${mid}`, body),
  deleteTemplateMilestone: (id: string, mid: string) => del(`${P}/templates/${id}/milestones/${mid}`),
  reorderTemplateMilestones: (id: string, body: unknown) => put(`${P}/templates/${id}/milestones/reorder`, body),

  // Accounts
  getAccounts: (params?: Q) => get(`${P}/accounts${qs(params)}`),
  getAccount: (id: string) => get(`${P}/accounts/${id}`),
  createAccount: (body: unknown) => post(`${P}/accounts`, body),
  updateAccount: (id: string, body: unknown) => put(`${P}/accounts/${id}`, body),
  deleteAccount: (id: string) => del(`${P}/accounts/${id}`),

  // Trackers
  getTrackers: (params?: Q) => get(`${P}/trackers${qs(params)}`),
  getTracker: (id: string) => get(`${P}/trackers/${id}`),
  createTracker: (body: unknown) => post(`${P}/trackers`, body),
  updateTracker: (id: string, body: unknown) => put(`${P}/trackers/${id}`, body),
  deleteTracker: (id: string) => del(`${P}/trackers/${id}`),
  advanceTracker: (id: string, body?: unknown) => post(`${P}/trackers/${id}/advance`, body),
  regressTracker: (id: string, body?: unknown) => post(`${P}/trackers/${id}/regress`, body),
  updateTrackerMilestone: (id: string, mid: string, body: unknown) => put(`${P}/trackers/${id}/milestones/${mid}`, body),

  // Blockers
  getBlockers: (params?: Q) => get(`${P}/blockers${qs(params)}`),
  createBlocker: (body: unknown) => post(`${P}/blockers`, body),
  updateBlocker: (id: string, body: unknown) => put(`${P}/blockers/${id}`, body),
  resolveBlocker: (id: string, body?: unknown) => post(`${P}/blockers/${id}/resolve`, body),
  reopenBlocker: (id: string, body?: unknown) => post(`${P}/blockers/${id}/reopen`, body),
  deleteBlocker: (id: string) => del(`${P}/blockers/${id}`),
  getBlockerCategories: () => get(`${P}/blockers/categories`),
  createBlockerCategory: (body: unknown) => post(`${P}/blockers/categories`, body),
  getFriction: () => get(`${P}/blockers/friction`),

  // Notes
  getNotes: (params?: Q) => get(`${P}/notes${qs(params)}`),
  createNote: (body: unknown) => post(`${P}/notes`, body),
  updateNote: (id: string, body: unknown) => put(`${P}/notes/${id}`, body),
  deleteNote: (id: string) => del(`${P}/notes/${id}`),

  // Tasks
  getTasks: (params?: Q) => get(`${P}/tasks${qs(params)}`),
  getMyTasks: () => get(`${P}/tasks/mine`),
  createTask: (body: unknown) => post(`${P}/tasks`, body),
  updateTask: (id: string, body: unknown) => put(`${P}/tasks/${id}`, body),
  deleteTask: (id: string) => del(`${P}/tasks/${id}`),

  // Activities
  getActivities: (params?: Q) => get(`${P}/activities${qs(params)}`),
  createActivity: (body: unknown) => post(`${P}/activities`, body),

  // SLA
  getSlaPolicies: () => get(`${P}/sla`),
  createSlaPolicy: (body: unknown) => post(`${P}/sla`, body),
  updateSlaPolicy: (id: string, body: unknown) => put(`${P}/sla/${id}`, body),
  deleteSlaPolicy: (id: string) => del(`${P}/sla/${id}`),
  getSlaAttainment: () => get(`${P}/sla/attainment`),

  // Risk
  getRiskItems: (params?: Q) => get(`${P}/risk${qs(params)}`),
  recomputeRisk: (body?: unknown) => post(`${P}/risk/recompute`, body),
  updateRiskItem: (id: string, body: unknown) => put(`${P}/risk/${id}`, body),
  snoozeRiskItem: (id: string, body?: unknown) => post(`${P}/risk/${id}/snooze`, body),
  deleteRiskItem: (id: string) => del(`${P}/risk/${id}`),

  // Stall detector
  getStalled: (params?: Q) => get(`${P}/stall${qs(params)}`),
  getStallSummary: () => get(`${P}/stall/summary`),

  // Analytics
  getTtv: (params?: Q) => get(`${P}/analytics/ttv${qs(params)}`),
  getCohorts: (params?: Q) => get(`${P}/analytics/cohorts${qs(params)}`),
  getStageFunnel: (params?: Q) => get(`${P}/analytics/stage-funnel${qs(params)}`),
  getTtvTrend: (params?: Q) => get(`${P}/analytics/trend${qs(params)}`),

  // Scorecards
  getScorecards: () => get(`${P}/scorecards`),
  getScorecard: (managerId: string) => get(`${P}/scorecards/${managerId}`),

  // Notifications
  getNotifications: () => get(`${P}/notifications`),
  markNotificationRead: (id: string) => post(`${P}/notifications/${id}/read`),
  markAllNotificationsRead: () => post(`${P}/notifications/read-all`),
  generateNotifications: () => post(`${P}/notifications/generate`),

  // Alerts
  getAlertRules: () => get(`${P}/alerts`),
  createAlertRule: (body: unknown) => post(`${P}/alerts`, body),
  updateAlertRule: (id: string, body: unknown) => put(`${P}/alerts/${id}`, body),
  deleteAlertRule: (id: string) => del(`${P}/alerts/${id}`),

  // Saved views
  getViews: (params?: Q) => get(`${P}/views${qs(params)}`),
  createView: (body: unknown) => post(`${P}/views`, body),
  updateView: (id: string, body: unknown) => put(`${P}/views/${id}`, body),
  deleteView: (id: string) => del(`${P}/views/${id}`),

  // Reports
  getReports: () => get(`${P}/reports`),
  createReport: (body: unknown) => post(`${P}/reports`, body),
  updateReport: (id: string, body: unknown) => put(`${P}/reports/${id}`, body),
  deleteReport: (id: string) => del(`${P}/reports/${id}`),
  runReport: (id: string, body?: unknown) => post(`${P}/reports/${id}/run`, body),
  getReportSnapshots: () => get(`${P}/reports/snapshots`),
  getReportSnapshot: (sid: string) => get(`${P}/reports/snapshots/${sid}`),

  // Share
  getSharedPlans: () => get(`${P}/share`),
  createSharedPlan: (body: unknown) => post(`${P}/share`, body),
  updateSharedPlan: (id: string, body: unknown) => put(`${P}/share/${id}`, body),
  deleteSharedPlan: (id: string) => del(`${P}/share/${id}`),
  getPublicPlan: (token: string) => get(`${P}/share/public/${token}`),

  // Imports
  getImportJobs: () => get(`${P}/imports`),
  importAccounts: (body: unknown) => post(`${P}/imports/accounts`, body),
  runConnector: (body: unknown) => post(`${P}/imports/connector`, body),
  seedSample: (body?: unknown) => post(`${P}/imports/seed-sample`, body),

  // Team
  getTeam: () => get(`${P}/team`),
  createTeamMember: (body: unknown) => post(`${P}/team`, body),
  updateTeamMember: (id: string, body: unknown) => put(`${P}/team/${id}`, body),
  deleteTeamMember: (id: string) => del(`${P}/team/${id}`),
  getTeamCapacity: () => get(`${P}/team/capacity`),

  // Billing
  getBillingPlan: () => get(`${P}/billing/plan`),
  startCheckout: (body?: unknown) => post(`${P}/billing/checkout`, body),
  openPortal: (body?: unknown) => post(`${P}/billing/portal`, body),
}

export default api
