/** GET /api/hospital-directory/config — real shape per hospital_directory/api.py. `api_key_masked` is the only credential representation the frontend ever sees (§14 — never a retrievable secret). */
export interface HospitalDirectoryConfig {
  configured: boolean
  base_url: string
  api_key_masked: string | null
  api_key_error: 'key_missing' | 'key_error' | null
  timeout_seconds: number
  verify_tls: boolean
  /** Admin switch for the Live ER roster (default off; can only be turned on after a passing ER roster test). */
  er_roster_enabled: boolean
  /** The ER roster is a SEPARATE 3iSoft API (v1.2, "meraj") with its own base URL and its own key. */
  er_configured: boolean
  er_base_url: string | null
  er_api_key_masked: string | null
  er_api_key_error: 'key_missing' | 'key_error' | null
  last_test_status: 'success' | 'failure' | null
  last_test_message: string | null
  last_test_at: string | null
}

export interface HospitalDirectoryConfigInput {
  base_url: string
  /** Omit or leave as the masked placeholder to keep the stored key unchanged (§14). */
  api_key?: string
  timeout_seconds: number
  verify_tls: boolean
}

/** POST /config/er-roster/save — omit `er_api_key` (or send the mask) to keep the stored ER key. Empty URL = not configured. */
export interface ErApiConfigInput {
  er_base_url: string
  er_api_key?: string
}

export interface TestConnectionResult {
  success: boolean
  status: string
  message: string
}

/** Result of POST /config/er-roster/enable — on a refused enable, `success` is false and `er_roster_enabled` stays false. */
export interface ErRosterSwitchResult {
  success: boolean
  status: string
  message: string
  er_roster_enabled: boolean
}

export interface MiddleNameCandidatesResponse {
  names: string[]
}

/** One training run — real shape per model_training/trainer.py's `_serialize_run` (shared by train/list/detail/live). Every metric is nullable: a `failed` run has none, and the backend explicitly does not cap/round/hide anomalous values (§23) — the frontend must not either. */
export interface TrainingRun {
  run_id: string
  model_name: string
  status: 'completed' | 'failed' | 'running'
  started_at: string | null
  finished_at: string | null
  row_count_train: number | null
  row_count_test: number | null
  train_data_start: string | null
  train_data_end: string | null
  hyperparameters: Record<string, number> | null
  metrics: {
    mae: number | null
    rmse: number | null
    mse: number | null
    r2: number | null
    mape: number | null
    smape: number | null
  }
  artifact_path: string | null
  is_live: boolean
  error_message: string | null
}

export interface TrainingStatus {
  training_in_progress: boolean
  current_run_id: string | null
}

/** GET /api/models/list — the raw filesystem view (§18/§19: demoted to Technical Details, never primary). */
export interface ModelFile {
  name: string
  size: number
  size_mb: number
  modified: string
  path: string
}

// GET /api/auth/users returns the same real shape as the /login response
// — already typed as `AuthUser` (types/auth.ts, built in V2.0's login
// layer). Re-exported here under the Settings-domain name rather than
// duplicating the interface.
export type { AuthUser as UserAccount } from './auth'

export interface UserAccountInput {
  username: string
  /** Required on create; omit on update to leave the password unchanged. */
  password?: string
  name: string
  role: string
  sections: string
  settings_tabs: string
  statistics_tabs: string
}
