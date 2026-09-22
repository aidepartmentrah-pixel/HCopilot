/**
 * GET /health (backend/app.py) — deliberately minimal: no DB access, just
 * liveness. It does not (yet) report database, Hospital Directory, or ER
 * roster connectivity separately — see SystemStatusPanel for how those are
 * derived from elsewhere instead of assumed here.
 */
export interface HealthResponse {
  status: string
}
