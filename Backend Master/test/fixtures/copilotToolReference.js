"use strict";

/**
 * Transcription du manifeste RÉEL des 74 Tools MCP (`src/ai/mcp/tools/`),
 * `{ requiredRoles, allowedEmails }` uniquement — nécessaire car le
 * manifeste réel (`src/ai/mcp/tools/index.js`) charge les VRAIS services
 * métier (donc Sequelize/la config DB), inutilisable dans une suite de
 * tests rapide et hors-ligne (même limite déjà documentée dans
 * `test/ai.orchestrator.pipeline.test.js`, qui mocke le même module à plus
 * petite échelle). Une seule source de vérité EST possible pour les
 * `requiredRoles` d'un Agent (les Agents réels sont construits directement
 * dans les tests, voir `ai.validation.copilotScenarios.test.js`) — mais pas
 * pour les Tools individuels, faute d'un moyen de les charger sans DB.
 *
 * Si ce fichier dérive de la réalité, `test/ai.mcp.tools.*.test.js` (qui
 * CHARGE le vrai manifeste avec une DB de test) le détecterait déjà pour
 * les modules qu'il couvre ; ce fichier n'ajoute qu'une vue consolidée,
 * pratique pour les tests de validation du Copilot.
 */
const MAINTENANCE_MANAGER_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const READ_WRITE_INDUSTRIAL_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];
const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const HR_REVIEWER_ROLES = ["admin", "superadmin", "superadmin2"];

const OPEN = { requiredRoles: [], allowedEmails: [] };

const TOOL_PERMISSIONS = {
  // ── users ──
  list_users: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  list_users_by_role: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  list_commercial_candidates: OPEN,
  set_user_active: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  set_user_role: { requiredRoles: ["superadmin", "superadmin2"], allowedEmails: [] },
  get_my_profile: OPEN,
  update_my_profile: OPEN,
  get_user_profile: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  update_user_profile: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },

  // ── notifications ──
  list_my_notifications: OPEN,
  mark_all_notifications_read: OPEN,
  mark_notification_read: OPEN,
  delete_notification: OPEN,
  send_notification_email: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },

  // ── pipeline ──
  list_pipeline_stages: OPEN,
  get_pipeline_stage: OPEN,
  create_pipeline_stage: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  update_pipeline_stage: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  delete_pipeline_stage: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  reorder_pipeline_stages: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },

  // ── projects ──
  list_projects: OPEN,
  move_project_stage: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  assign_project_owner: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },

  // ── projectActions ── (voir AUTOMATION_WORKFLOWS.md)
  create_project_action: OPEN,

  // ── commercialContacts ── (vocabulaire des rôles v2 : ancien "commercial"
  // = commercial_sedentaire, voir src/constants/roles.js)
  get_commercial_contact_kpi: { requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES], allowedEmails: [] },
  get_commercial_contact_analytics: { requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES], allowedEmails: [] },
  get_commercial_personal_kpi_summary: { requiredRoles: ["commercial_sedentaire", ...ADMIN_TIER_ROLES], allowedEmails: [] },

  // ── maintenance ──
  create_maintenance_request: OPEN,
  accept_maintenance_request: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  reject_maintenance_request: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  assign_maintenance_technician: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  start_maintenance_request: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  complete_maintenance_request: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  delete_maintenance_request: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  get_maintenance_stats: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  list_my_maintenance_requests: OPEN,
  list_all_maintenance_requests: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  get_maintenance_request: OPEN,
  list_maintenance_technicians: { requiredRoles: MAINTENANCE_MANAGER_ROLES, allowedEmails: ["accueilcbif@gmail.com"] },
  add_maintenance_comment: OPEN,
  list_maintenance_comments: OPEN,
  get_maintenance_history: OPEN,

  // ── industrial ──
  create_industrial_record: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  list_industrial_records: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  get_industrial_record: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  update_industrial_record: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  delete_industrial_record: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },

  // ── porPromesh ──
  create_por_promesh: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  create_or_open_por_promesh_draft: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  list_por_promesh_operators: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  list_por_promesh: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  get_por_promesh_dashboard: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  get_por_promesh_stats: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  get_por_promesh: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  update_por_promesh: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },
  delete_por_promesh: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  validate_por_promesh: { requiredRoles: READ_WRITE_INDUSTRIAL_ROLES, allowedEmails: [] },

  // ── dashboard ──
  get_dashboard_kpis: OPEN,
  get_legacy_dashboard_kpis: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  get_professional_dashboard: { requiredRoles: ADMIN_TIER_ROLES, allowedEmails: [] },
  get_user_dashboard: OPEN,

  // ── hr ──
  list_hr_requests: OPEN,
  get_hr_request: OPEN,
  create_hr_request: OPEN,
  accept_hr_request: { requiredRoles: HR_REVIEWER_ROLES, allowedEmails: ["manegerofficecbi@gmail.com"] },
  reject_hr_request: { requiredRoles: HR_REVIEWER_ROLES, allowedEmails: ["manegerofficecbi@gmail.com"] },
  mark_hr_request_processed: { requiredRoles: HR_REVIEWER_ROLES, allowedEmails: ["manegerofficecbi@gmail.com"] },
  add_hr_request_comment: OPEN,
  get_hr_request_history: OPEN,
  delete_hr_request: OPEN,

  // ── googleCalendar ──
  get_calendar_status: OPEN,
  create_calendar_event: OPEN,
  update_calendar_event: OPEN,
  delete_calendar_event: OPEN,
};

// toolName -> moduleKey, EXACTEMENT les mêmes clés que intentCatalog.js
// (`byModule` du vrai manifeste mcp/tools/index.js) — nécessaire pour
// reconstruire un `toolModuleIndex` réaliste sans charger le vrai
// manifeste (voir doc de fichier plus haut).
const TOOL_MODULE_MAP = {
  list_users: "users", list_users_by_role: "users", list_commercial_candidates: "users", set_user_active: "users",
  set_user_role: "users", get_my_profile: "users", update_my_profile: "users", get_user_profile: "users", update_user_profile: "users",

  list_my_notifications: "notifications", mark_all_notifications_read: "notifications", mark_notification_read: "notifications",
  delete_notification: "notifications", send_notification_email: "notifications",

  list_pipeline_stages: "pipeline", get_pipeline_stage: "pipeline", create_pipeline_stage: "pipeline",
  update_pipeline_stage: "pipeline", delete_pipeline_stage: "pipeline", reorder_pipeline_stages: "pipeline",

  list_projects: "projects", move_project_stage: "projects", assign_project_owner: "projects",

  create_project_action: "projectActions",

  get_commercial_contact_kpi: "commercialContacts", get_commercial_contact_analytics: "commercialContacts",
  get_commercial_personal_kpi_summary: "commercialContacts",

  create_maintenance_request: "maintenance", accept_maintenance_request: "maintenance", reject_maintenance_request: "maintenance",
  assign_maintenance_technician: "maintenance", start_maintenance_request: "maintenance", complete_maintenance_request: "maintenance",
  delete_maintenance_request: "maintenance", get_maintenance_stats: "maintenance", list_my_maintenance_requests: "maintenance",
  list_all_maintenance_requests: "maintenance", get_maintenance_request: "maintenance", list_maintenance_technicians: "maintenance",
  add_maintenance_comment: "maintenance", list_maintenance_comments: "maintenance", get_maintenance_history: "maintenance",

  create_industrial_record: "industrial", list_industrial_records: "industrial", get_industrial_record: "industrial",
  update_industrial_record: "industrial", delete_industrial_record: "industrial",

  create_por_promesh: "porPromesh", create_or_open_por_promesh_draft: "porPromesh", list_por_promesh_operators: "porPromesh",
  list_por_promesh: "porPromesh", get_por_promesh_dashboard: "porPromesh", get_por_promesh_stats: "porPromesh",
  get_por_promesh: "porPromesh", update_por_promesh: "porPromesh", delete_por_promesh: "porPromesh", validate_por_promesh: "porPromesh",

  get_dashboard_kpis: "dashboard", get_legacy_dashboard_kpis: "dashboard", get_professional_dashboard: "dashboard", get_user_dashboard: "dashboard",

  list_hr_requests: "hr", get_hr_request: "hr", create_hr_request: "hr", accept_hr_request: "hr", reject_hr_request: "hr",
  mark_hr_request_processed: "hr", add_hr_request_comment: "hr", get_hr_request_history: "hr", delete_hr_request: "hr",

  get_calendar_status: "googleCalendar", create_calendar_event: "googleCalendar", update_calendar_event: "googleCalendar", delete_calendar_event: "googleCalendar",
};

module.exports = { TOOL_PERMISSIONS, TOOL_MODULE_MAP, MAINTENANCE_MANAGER_ROLES, READ_WRITE_INDUSTRIAL_ROLES, ADMIN_TIER_ROLES, HR_REVIEWER_ROLES };
