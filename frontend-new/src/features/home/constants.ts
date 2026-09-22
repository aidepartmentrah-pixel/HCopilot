/**
 * Centralized Home dashboard thresholds (Dashboard spec §9's own
 * instruction: "Do not hardcode these thresholds inside random UI
 * components. Store them centrally"). Shared by OperationalAlertsPanel and
 * the shell's NotificationBell — one set of rules, not two.
 */
export const NEW_PATIENT_NO_ISBAR_MINUTES = 5
export const OCCUPANCY_WARNING_PCT = 80
export const OCCUPANCY_HIGH_PCT = 90
export const ROSTER_STALE_MINUTES = 8
