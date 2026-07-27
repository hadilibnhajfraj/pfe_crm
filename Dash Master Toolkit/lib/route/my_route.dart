import 'package:flutter/material.dart';
import 'package:dash_master_toolkit/app_shell_route/app_shell.dart';

import 'package:dash_master_toolkit/application/calendar/view/calendar_view_screen.dart';
import 'package:dash_master_toolkit/application/calendar/view/followup_calendar_screen.dart';
import 'package:dash_master_toolkit/application/chat/view/chat_screen.dart';
import 'package:dash_master_toolkit/application/kanban/view/kanban_view_screen.dart';
import 'package:dash_master_toolkit/application/users/view/user_grid_screen.dart';
import 'package:dash_master_toolkit/application/users/view/user_list_screen.dart';
import 'package:dash_master_toolkit/application/users/view/user_profile_screen.dart';
import 'package:dash_master_toolkit/application/users/view/commercial_contact_create_screen.dart';
import 'package:dash_master_toolkit/application/users/view/accueil_project_stats_table_screen.dart';
import 'package:dash_master_toolkit/application/users/view/admin_clients_screen.dart';
import 'package:dash_master_toolkit/application/users/view/user_projects_screen.dart';
import 'package:dash_master_toolkit/application/users/view/revendeur_projects_screen.dart';
import 'package:dash_master_toolkit/application/users/view/applicateur_projects_screen.dart';
import 'package:dash_master_toolkit/dashboard/academic/view/academic_dashboard_screen.dart';
import 'package:dash_master_toolkit/dashboard/academic/view/dashboard_screen.dart';
import 'package:dash_master_toolkit/dashboard/ecommerce/view/ecommerce_dashboard_screen.dart';
import 'package:dash_master_toolkit/dashboard/finance/view/finance_dashboard_screen.dart';
import 'package:dash_master_toolkit/dashboard/sales/view/sales_dashboard_screen.dart';
import 'package:dash_master_toolkit/forms/view/basic_form_fields_screen.dart';
import 'package:dash_master_toolkit/forms/view/custom_form_screen.dart';
import 'package:dash_master_toolkit/forms/view/validation_form_screen.dart';
import 'package:dash_master_toolkit/forms/view/project_form_screen.dart';

import 'package:dash_master_toolkit/others/chart/view/chart_screen.dart';
import 'package:dash_master_toolkit/others/components/view/avtar_screen.dart';
import 'package:dash_master_toolkit/others/components/view/buttons_screen.dart';
import 'package:dash_master_toolkit/others/components/view/card_screen.dart';
import 'package:dash_master_toolkit/others/components/view/carousel_screen.dart';
import 'package:dash_master_toolkit/others/components/view/dialogs_screen.dart';
import 'package:dash_master_toolkit/others/components/view/ratting_screen.dart';
import 'package:dash_master_toolkit/others/components/view/tabs_screen.dart';
import 'package:dash_master_toolkit/others/components/view/toast_screen.dart';

import 'package:dash_master_toolkit/pages/auth/view/forgot_password_screen.dart';
import 'package:dash_master_toolkit/pages/auth/view/reset_password_screen.dart';
import 'package:dash_master_toolkit/pages/auth/view/sign_in_screen.dart';
import 'package:dash_master_toolkit/pages/auth/view/sign_up_screen.dart';

import 'package:dash_master_toolkit/pages/faq/view/faq_screen.dart';
import 'package:dash_master_toolkit/pages/google_map/google_map_screen.dart';
import 'package:dash_master_toolkit/pages/privacy_term_condition/view/privacy_screen.dart';
import 'package:dash_master_toolkit/pages/privacy_term_condition/view/terms_condition_screen.dart';
import 'package:dash_master_toolkit/pages/projects/view/projects_screen.dart';
import 'package:dash_master_toolkit/pages/projects/view/missing_fields_projects_screen.dart';

import 'package:dash_master_toolkit/tables/view/basic_table_screen.dart';
import 'package:dash_master_toolkit/tables/view/drag_and_drop_table_screen.dart';
import 'package:dash_master_toolkit/tables/view/hover_table_screen.dart';
import 'package:dash_master_toolkit/tables/view/stripped_row_table_screen.dart';
import 'package:dash_master_toolkit/application/users/view/commercial_contact_list_getx_screen.dart';
import 'package:dash_master_toolkit/application/users/view/users_table.dart';
import 'package:dash_master_toolkit/application/users/view/user_project_screen.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_service.dart';
import '../providers/language_provider.dart';
import 'package:provider/provider.dart';
import 'package:dash_master_toolkit/forms/view/devis_upload_screen.dart';
import 'package:get_storage/get_storage.dart';
import 'package:dash_master_toolkit/forms/view/project_timeline_screen.dart';
import 'package:dash_master_toolkit/forms/view/project_pipeline_screen.dart';
import 'package:dash_master_toolkit/forms/view/archive_requests_page.dart';
import 'package:dash_master_toolkit/forms/view/archive_request_chat_screen.dart';
import 'package:dash_master_toolkit/forms/view/maintenance_requests_page.dart';
import 'package:dash_master_toolkit/forms/view/maintenance_request_detail_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_requests_admin_page.dart';
import 'package:dash_master_toolkit/forms/view/projects_explorer_screen.dart';
import 'package:dash_master_toolkit/application/users/view/commercial_timeline_screen.dart';
import 'package:dash_master_toolkit/application/users/view/add_commercial_action_screen.dart';
import 'package:dash_master_toolkit/dashboard/commercial_contacts/view/commercial_contacts_kpi_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/por_promesh_list_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/por_promesh_detail_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/por_promesh_dashboard_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/por_promesh_historique_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/por_promesh_statistiques_screen.dart';
import 'package:dash_master_toolkit/application/users/view/commercial_contacts_analytics_screen.dart';
import 'package:dash_master_toolkit/pages/auth/view/commercial_selection_screen.dart';

import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/view/machine_overview_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/machine_shift_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar_form_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/melange_form_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/melange/melange_history_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/melange/melange_details_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/maintenance_form_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/industrial_historique_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_type_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_history_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_conge_form_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_sortie_form_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_detail_screen.dart';
import 'package:dash_master_toolkit/forms/hr/view/hr_admin_profile_screen.dart';
import 'package:dash_master_toolkit/forms/recuperables/view/recuperable_fiche_screen.dart';
import 'package:dash_master_toolkit/forms/recuperables/view/recuperable_history_screen.dart';
import 'package:dash_master_toolkit/forms/recuperables/view/recuperable_detail_screen.dart';
import 'package:dash_master_toolkit/forms/recuperables/view/recuperable_stats_screen.dart';
import 'package:dash_master_toolkit/dashboard/industrial/view/industrial_super_admin_dashboard_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_poste_dashboard_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_modules_grid_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_rendement_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_personnel_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_observation_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_non_conformite_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_controle_machine_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_controle_qualite_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_parametres_poste_screen.dart';
import 'package:dash_master_toolkit/forms/industrial/view/probar/probar_detail_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/modules_grid_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/info_generale_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/poste_dashboard_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/rendement_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/observation_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/non_conformite_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/personnel_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_machine_screen.dart';
import 'package:dash_master_toolkit/forms/por_promesh/view/modules/controle_qualite_screen.dart';

class MyRoute {
  static const login = '/login';
  static const dashboard = '/dashboard';

  static const academicAdmin = 'academic-admin';
  static const dashboardAcademicAdmin = '/dashboard/academic-admin';

  static const salesAdmin = '/kpi-projects';
  static const dashboardComercial = "/dashboard-commercial";
  static const dashboardSalesAdmin = '/dashboard/kpi-projects';
  static const commercialContactsKpi        = '/dashboard/commercial-contacts-kpi';
  static const commercialContactsKpiUsers   = '/users/commercial-contacts-kpi';

  static const financeAdmin = 'finance-admin';
  static const dashboardFinanceAdmin = '/dashboard/finance-admin';

  static const ecommerceAdmin = '/kpi-project';
  static const dashboardEcommerceAdmin = '/dashboard/kpi-project';
  static const projectTimeline = "/forms/project-timeline";
  static const calendarScreen = '/calendar';
  static const followupCalendarScreen = '/calendar/followups';
  static const chatScreen = '/chat';
  static const kanbanScreen = '/kanban';
  static const projectsScreen = '/projects';
  static const mapScreen = '/google_map';
  static const faqScreen = '/faq';
  static const privacyPolicyScreen = '/privacy_policy';
  static const termsConditionScreen = '/terms_condition';
  static const commercialContacts = '/users/commercial-contacts';

  static const basicTablesScreen = '/tables/basic_tables';
  static const stripedRowTableScreen = '/tables/striped_row_table';
  static const hoverTableScreen = '/tables/hover_table';
  static const dragDropTableScreen = '/tables/drag_drop_table';

  static const formsBasicFieldsScreen = '/forms/forms_basic_fields';
  static const customFormScreen = '/forms/custom_form';
  static const validationFormScreen = '/forms/validation_form';
 static const dashboardScreen = '/kpi';
  // ✅ IMPORTANT : c’est bien /forms/project (pas null)
  static const projectFormScreen = '/forms/project';
  static const porPromeshRoot = '/por-promesh';
  static const porPromeshDashboardScreen = '/por-promesh/dashboard';
  static const porPromeshListScreen = '/por-promesh/list';
  static const porPromeshDetailScreen = '/por-promesh/detail';
  static const porPromeshHistoriqueScreen = '/por-promesh/historique';
  static const porPromeshStatistiquesScreen = '/por-promesh/statistiques';

  // ── Module industriel — PRODUCTION (PROMESH/PROBAR) / MÉLANGE / MAINTENANCE
  static const productionRoot = '/production';
  static const productionPromeshRoot = '/production/promesh';
  static const productionProbarRoot = '/production/probar';
  static const probarFormScreen = '/production/probar/form';
  static const melangeRoot = '/melange';
  static const melangeFormScreen = '/melange/form';
  static const melangeHistoriqueScreen = '/melange/historique';
  static const melangeDetailScreen = '/melange/detail';
  static const maintenanceRoot = '/maintenance';
  static const maintenanceFormScreen = '/maintenance/form';
  static const maintenanceHistoriqueScreen = '/maintenance/historique';
  static const industrialRoutePrefixes = [
    porPromeshRoot,
    productionRoot,
    melangeRoot,
    maintenanceRoot,
    hrRoot,
    recuperableRoot,
  ];

  // ── Module RH — Demandes (congé / autorisation de sortie) ────────────────
  static const hrRoot = '/rh';
  static const hrHistoriqueScreen = '/rh/historique';
  static const hrCongeFormScreen = '/rh/conge';
  static const hrSortieFormScreen = '/rh/sortie';
  static const hrDetailScreen = '/rh/detail';
  static const hrAdminProfilesScreen = '/rh/profils';

  // ── Module Récupérables ───────────────────────────────────────────────────
  static const recuperableRoot = '/recuperables';
  static const recuperableFicheScreen = '/recuperables/fiche';
  static const recuperableHistoriqueScreen = '/recuperables/historique';
  static const recuperableDetailScreen = '/recuperables/detail';
  static const recuperableStatsScreen = '/recuperables/statistiques';

  // ── Dashboard Industriel — Super Admin ────────────────────────────────────
  static const superAdminDashboardScreen = '/super-admin/dashboard';
 static const devisEditScreen = '/forms/devis-edit';
  static const buttonsScreen = '/components/buttons';
  static const tabsScreen = '/components/tabs';
  static const dialogScreen = '/components/dialog';
  static const carouselScreen = '/components/carousel';
  static const avatarScreen = '/components/avatar';
  static const cardScreen = '/components/card';
  static const toastScreen = '/components/toast';
  static const ratingScreen = '/components/rating';
static const  projectPipeline = "/forms/pipeline";
  static const chartScreen = '/chart';
static const commercialTimeline = '/commercial-timeline';
  static const userListScreen = '/users/user-list';
  static const userGridScreen = '/users/project-list';
  static const userProfileScreen = '/users/user_profile';
  static const projectsProfileScreen = '/users/user_project';
static const commercialProfileScreen = '/commercial';
static const accueilProfileScreen = '/accueil';
static const clientProfileScreen = '/client';
static const clientsProfileScreen = '/users/client';
  static const signInScreen = '/authentication/signin';
  static const signUpScreen = '/authentication/signup';
  static const forgotPasswordScreen = '/authentication/forgot_password';
  static const resetPasswordScreen = '/authentication/reset_password';
  static const commercialSelectionScreen = '/authentication/select-commercial';
    static const  applicateurProjectsScreen = "/users/applicateur";
  static const  revendeurProjectsScreen = "/users/revendeur";
  // Route réelle : nichée sous le parent '/forms' (voir GoRoute path: 'archive-requests').
  static const archiveRequestsScreen = '/forms/archive-requests';
  // Route réelle : nichée sous le parent '/forms' (voir GoRoute path: 'maintenance-requests').
  static const maintenanceRequestsScreen = '/forms/maintenance-requests';
  // Routes réelles : nichées sous le parent '/forms' (voir GoRoute path: 'hr-requests/conge'|'hr-requests/sortie').
  static const hrCongeRequestsScreen = '/forms/hr-requests/conge';
  static const hrSortieRequestsScreen = '/forms/hr-requests/sortie';
  static const initialPath = '/';
  static final rootNavigatorKey = GlobalKey<NavigatorState>();

  static final GoRouter router = GoRouter(
    initialLocation: signInScreen,
    refreshListenable: AuthService(),

    redirect: (context, state) {
      final loggedIn = AuthService().isLoggedIn;
      final loc = state.matchedLocation;

      final isAuthRoute = loc == signInScreen ||
          loc == signUpScreen ||
          loc == forgotPasswordScreen ||
          loc == resetPasswordScreen;

      // ── Non connecté sur route protégée → login ─────────────────────────
      if (!loggedIn && !isAuthRoute) return signInScreen;

      if (loggedIn) {
        final role = (AuthService().userRole ?? '').toLowerCase().trim();

        // ── Espace dédié responsable_logistique_achat ───────────────────
        // Cette personne ne doit jamais voir le CRM (Dashboard, KPI, Commercial,
        // Clients, Users, Administration...) — accès verrouillé sur le module
        // industriel (POR PROMESH, PRODUCTION, MÉLANGE, MAINTENANCE).
        final isOnIndustrialRoute = industrialRoutePrefixes
            .any((p) => loc == p || loc.startsWith('$p/'));
        if (role == 'responsable_logistique_achat' &&
            !isAuthRoute &&
            !isOnIndustrialRoute) {
          return porPromeshDashboardScreen;
        }

        // ── Connecté sur auth route ou racine → dashboard ─────────────────
        // La sélection du commercial (@probardistribution.com) est gérée
        // exclusivement dans sign_in_screen.dart après un login réussi.
        // Le router NE redirige JAMAIS vers select-commercial automatiquement.
        if (loc == initialPath || isAuthRoute) {
          print('ROLE = $role');
          if (role == 'responsable_logistique_achat') {
            return porPromeshDashboardScreen;
          }
          if (role == 'commercial') {
            debugPrint('REDIRECTION → $commercialContactsKpiUsers');
            return commercialContactsKpiUsers;
          }
          // ── Dashboard Business Intelligence ─────────────────────────
          // Priorité 1 : rôle admin (SUPER_ADMIN / ADMIN_CBI côté cahier
          // des charges = admin/superadmin/superadmin2 dans ce projet —
          // même convention que sidebar_widget.dart `isAdmin`) → BI.
          // Priorité 2 (repli compatibilité, uniquement si AUCUN rôle
          // admin n'est positionné) : l'email racine
          // cbitunisia@cbi-tunisia.com → BI également. Ce compte a en
          // pratique déjà role=superadmin (priorité 1), le repli email
          // ne sert que si le rôle venait à être mal renseigné.
          // Remplace l'ancien comportement qui envoyait cet email vers le
          // Dashboard Industriel — il ne doit plus jamais y passer par
          // défaut (mais l'entrée "Dashboard Industriel" reste dans son
          // menu, voir sidebar_widget.dart).
          //
          // Tous les autres rôles (user, accueil, ...) atterrissent aussi
          // ici : DashboardScreen bascule en interne sur la vue "Dashboard
          // Utilisateur" quand isAdmin est faux (dashboard_screen.dart).
          return dashboardSalesAdmin;
        }
      }

      // ── Route racine → login ─────────────────────────────────────────────
      if (loc == initialPath) return signInScreen;

      return null;
    },

    routes: [
      GoRoute(
        path: initialPath,
        redirect: (context, state) {
          final appLangProvider = Provider.of<AppLanguageProvider>(context);
          if (state.uri.queryParameters['rtl'] == 'true') {
            appLangProvider.isRTL = true;
          }
          return signInScreen;
        },
      ),

      // AUTH
      GoRoute(
        path: signInScreen,
        pageBuilder: (context, state) =>
            const NoTransitionPage<void>(child: SignInScreen()),
      ),
      GoRoute(
        path: signUpScreen,
        pageBuilder: (context, state) =>
            const NoTransitionPage<void>(child: SignUpScreen()),
      ),
      GoRoute(
        path: forgotPasswordScreen,
        pageBuilder: (context, state) =>
            const NoTransitionPage<void>(child: ForgotPasswordScreen()),
      ),
      GoRoute(
        path: resetPasswordScreen,
        pageBuilder: (context, state) => NoTransitionPage<void>(
          child: ResetPasswordScreen(
            email: state.uri.queryParameters['email'],
            token: state.uri.queryParameters['token'],
          ),
        ),
      ),
      // ── Sélection commercial (hors AppShell, obligatoire pour role=commercial)
      GoRoute(
        path: commercialSelectionScreen,
        pageBuilder: (context, state) =>
            const NoTransitionPage<void>(child: CommercialSelectionScreen()),
      ),

      // APP SHELL
      ShellRoute(
        navigatorKey: rootNavigatorKey,
        pageBuilder: (context, state, child) =>
            NoTransitionPage(child: AppShell(child: child)),
        routes: [
          // Dashboard — all sub-routes → DashboardScreen (nouveau BI professionnel)
          GoRoute(
            path: dashboard,
            redirect: (context, state) {
              if (state.fullPath == dashboard) return dashboardSalesAdmin;
              return null;
            },
            routes: [
              // Tous les sous-menus dashboard rendent DashboardScreen
              GoRoute(
                path: academicAdmin,
                pageBuilder: (context, state) {
                  final token = AuthService().accessToken ?? '';
                  return NoTransitionPage(child: DashboardScreen(token: token));
                },
              ),
              GoRoute(
                path: salesAdmin,
                pageBuilder: (context, state) {
                  final token = AuthService().accessToken ?? '';
                  return NoTransitionPage(child: DashboardScreen(token: token));
                },
              ),
              GoRoute(
                path: financeAdmin,
                pageBuilder: (context, state) {
                  final token = AuthService().accessToken ?? '';
                  return NoTransitionPage(child: DashboardScreen(token: token));
                },
              ),
              GoRoute(
                path: ecommerceAdmin,
                pageBuilder: (context, state) {
                  final token = AuthService().accessToken ?? '';
                  return NoTransitionPage(child: DashboardScreen(token: token));
                },
              ),
              GoRoute(
                path: 'commercial-contacts-kpi',
                pageBuilder: (context, state) {
                  final token = AuthService().accessToken ?? '';
                  return NoTransitionPage(
                    child: CommercialContactsKpiScreen(token: token),
                  );
                },
              ),
            ],
          ),

          // Applications
          GoRoute(
            path: calendarScreen,
            pageBuilder: (context, state) =>
                NoTransitionPage(child: CalendarViewScreen()),
          ),
          GoRoute(
            path: followupCalendarScreen,
            pageBuilder: (context, state) =>
                NoTransitionPage(child: FollowupCalendarScreen()),
          ),
          GoRoute(
            path: chatScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: ChatScreen()),
          ),
          GoRoute(
            path: kanbanScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: KanbanViewScreen()),
          ),

          // Users
          GoRoute(
            path: '/users',
            redirect: (context, state) {
              if (state.fullPath == '/users') return userListScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'user-list',
                redirect: (context, state) {
                  final role =
                      (AuthService().userRole ?? '').toLowerCase();
                  final ok = role == 'admin' || role == 'superadmin' || role == 'superadmin2';
                  return ok ? null : dashboard;
                },
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: UserListScreen()),
              ),
              GoRoute(
                path: 'project-list',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: UserGridScreen(initialFilters: state.uri.queryParameters),
                ),
              ),
              GoRoute(
                path: 'user_profile',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: UserProfileScreen()),
              ),
              GoRoute(
  path: 'user_project',
  pageBuilder: (context, state) =>
      const NoTransitionPage(child: ProjectsExplorerScreen()),
),
GoRoute(
  path: "applicateur",
  builder: (context, state) => const ApplicateurProjectsScreen(),
),

GoRoute(
  path: '/revendeur',
  builder: (context, state) => const RevendeurProjectsScreen(),
),
GoRoute(
  path: MyRoute.clientProfileScreen,
  pageBuilder: (context, state) => NoTransitionPage(
    child: AdminClientsScreen(),
  ),
),
GoRoute(
  path: '/commercial-contacts',
  pageBuilder: (context, state) => NoTransitionPage(
    child: CommercialContactListGetxScreen(
      token: AuthService().accessToken ?? '',
    ),
  ),
),
GoRoute(
  path: '/dashboard-commercial',

  redirect: (context, state) {
    final role = AuthService().userRole;
    if (role != "superadmin" && role != "superadmin2") {
      return "/unauthorized";
    }
    return null;
  },

  pageBuilder: (context, state) => NoTransitionPage(
    child: UsersTable(),
  ),
),
GoRoute(
  path: '/commercial-timeline/:id',
  builder: (context, state) {

    final contactId = state.pathParameters['id']!;
    final token = state.extra as String;

    return CommercialTimelineScreen(
      contactId: contactId,
      token: token,
    );
  },
),
GoRoute(
  path: '/commercial-add-action',
  builder: (context, state) {
    final contactId = state.uri.queryParameters['contactId']!;

    return AddCommercialActionScreen(
      contactId: contactId,
    );
  },
),
GoRoute(
  path: '/commercial-contacts-kpi',
  redirect: (context, state) {
    final role = (AuthService().userRole ?? '').toLowerCase().trim();
    debugPrint('ROLE CONNECTE = $role');
    final canView = AuthService().canViewCommercialKpi;
    if (!canView) {
      debugPrint('Accès refusé à /users/commercial-contacts-kpi pour role=$role → redirection dashboard');
      return dashboardSalesAdmin;
    }
    return null;
  },
  pageBuilder: (context, state) => NoTransitionPage(
    child: CommercialContactsAnalyticsScreen(
      token: AuthService().accessToken ?? '',
    ),
  ),
),

            ],
          ),

          // Pages
          GoRoute(
            path: projectsScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: ProjectsScreen()),
          ),
          GoRoute(
            path: '/projects-list',
            pageBuilder: (context, state) {
              final field = state.uri.queryParameters['field'] ?? '';
              final label = state.uri.queryParameters['label'] ?? '';
              return NoTransitionPage(
                child: MissingFieldsProjectsScreen(field: field, label: label),
              );
            },
          ),
          
          GoRoute(
            path: mapScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: GoogleMapScreen()),
          ),
          GoRoute(
            path: faqScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: FaqScreen()),
          ),
          GoRoute(
            path: privacyPolicyScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: PrivacyScreen()),
          ),
          GoRoute(
            path: termsConditionScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: TermsConditionScreen()),
          ),
GoRoute(
  path: MyRoute.commercialProfileScreen,
  pageBuilder: (context, state) =>
      NoTransitionPage(child: CommercialContactCreateScreen()),
),
GoRoute(
  path: MyRoute.accueilProfileScreen,
  pageBuilder: (context, state) {
    final box = GetStorage();

    final token = (box.read('accessToken') ?? '').toString();
    final role = (box.read('userRole') ?? '').toString().trim().toLowerCase();
    final userId = (box.read('userId') ?? '').toString();
    final userEmail = (box.read('userEmail') ?? '').toString();

    print('DEBUG route token = $token');
    print('DEBUG route role = $role');
    print('DEBUG route userId = $userId');
    print('DEBUG route userEmail = $userEmail');

    return NoTransitionPage(
      child: AccueilProjectStatsTableScreen(
        token: token,
        userRole: role,
      ),
    );
  },
),
          // Tables
          GoRoute(
            path: '/tables',
            redirect: (context, state) {
              if (state.fullPath == '/tables') return basicTablesScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'basic_tables',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: BasicTableScreen()),
              ),
              GoRoute(
                path: 'striped_row_table',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: StrippedRowTableScreen()),
              ),
              GoRoute(
                path: 'hover_table',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: HoverTableScreen()),
              ),
              GoRoute(
                path: 'drag_drop_table',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: DragAndDropTableScreen()),
              ),
            ],
          ),

          // Forms
          GoRoute(
            path: '/forms',
            redirect: (context, state) {
              if (state.fullPath == '/forms') return formsBasicFieldsScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'forms_basic_fields',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: BasicFormFieldsScreen()),
              ),
              GoRoute(
                path: 'custom_form',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: CustomFormScreen()),
              ),
              GoRoute(
                path: 'validation_form',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: ValidationFormScreen()),
              ),
              // ✅ /forms/project?id=...
              GoRoute(
                path: 'project',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: ProjectFormScreen()),
              ),
              GoRoute(
  path: 'devis-edit',
  pageBuilder: (context, state) {
    final projectId = state.uri.queryParameters['projectId'] ?? "";
    return NoTransitionPage(
      child: DevisUploadScreen(
        projectId: projectId,
        isEdit: true, // ✅
      ),
    );
  },
),
GoRoute(
  path: "project-timeline",
  builder: (context, state) {

    final projectId = state.uri.queryParameters["projectId"]!;

    return ProjectTimelineScreen(
      projectId: projectId,
    );

  },
),
GoRoute(
  path: 'pipeline', // ✅ IMPORTANT
  name: 'pipeline',
  builder: (context, state) => const ProjectPipelineScreen(),
),
GoRoute(
  path: 'archive-requests',
  name: 'archive-requests',
  redirect: (context, state) {
    // Seul cbitunisia@cbi-tunisia.com peut voir/gérer les demandes
    // d'archivage/désarchivage (rôle admin/superadmin/superadmin2 non
    // suffisant — voir AuthService.isRootAdmin).
    return AuthService().isRootAdmin ? null : dashboard;
  },
  builder: (context, state) => const ArchiveRequestsPage(),
  routes: [
    GoRoute(
      path: 'chat',
      name: 'archive-request-chat',
      redirect: (context, state) {
        return AuthService().isRootAdmin ? null : dashboard;
      },
      builder: (context, state) {
        final id = state.uri.queryParameters['id'] ?? '';
        return ArchiveRequestChatScreen(requestId: id);
      },
    ),
  ],
),
GoRoute(
  path: 'maintenance-requests',
  name: 'maintenance-requests',
  // Accessible à tout utilisateur authentifié — contrairement à
  // archive-requests, chaque utilisateur voit/gère ses propres demandes.
  builder: (context, state) => const MaintenanceRequestsPage(),
  routes: [
    GoRoute(
      path: 'details',
      name: 'maintenance-request-details',
      builder: (context, state) {
        final id = state.uri.queryParameters['id'] ?? '';
        return MaintenanceRequestDetailScreen(requestId: id);
      },
    ),
  ],
),
GoRoute(
  path: 'hr-requests/conge',
  name: 'hr-requests-conge',
  // Accessible à tout utilisateur authentifié — chaque employé voit ses
  // propres demandes, le Responsable RH (canManageHrRequests) voit tout.
  builder: (context, state) => const HrRequestsAdminPage(type: 'conge'),
),
GoRoute(
  path: 'hr-requests/sortie',
  name: 'hr-requests-sortie',
  builder: (context, state) => const HrRequestsAdminPage(type: 'sortie'),
),

            ],
          ),

          // ── POR PROMESH — espace dédié (responsable_logistique_achat / admin / superadmin)
          GoRoute(
            path: porPromeshRoot,
            redirect: (context, state) {
              final ok = AuthService().canViewPorPromesh;
              if (!ok) return dashboard;
              if (state.fullPath == porPromeshRoot) return porPromeshDashboardScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'dashboard',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: PorPromeshDashboardScreen()),
              ),
              GoRoute(
                path: 'list',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: PorPromeshListScreen()),
              ),
              GoRoute(
                path: 'detail',
                pageBuilder: (context, state) {
                  final id = state.uri.queryParameters['id'] ?? '';
                  return NoTransitionPage(child: PorPromeshDetailScreen(id: id));
                },
              ),
              GoRoute(
                path: 'historique',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: PorPromeshHistoriqueScreen()),
              ),
              GoRoute(
                path: 'statistiques',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: PorPromeshStatistiquesScreen()),
              ),
            ],
          ),

          // ── MODULE INDUSTRIEL — PRODUCTION (PROMESH/PROBAR) ──────────────
          GoRoute(
            path: productionRoot,
            redirect: (context, state) =>
                AuthService().canViewPorPromesh ? null : dashboard,
            routes: [
              GoRoute(
                path: 'promesh',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: MachineOverviewScreen(
                    title: 'PROMESH',
                    lineRoot: productionPromeshRoot,
                    color: kPromeshColor,
                    fetchPromeshStats: true,
                  ),
                ),
                routes: [
                  GoRoute(
                    path: 'machine/:num',
                    pageBuilder: (context, state) => NoTransitionPage(
                      child: MachineShiftScreen(
                        line: 'promesh',
                        lineLabel: 'PROMESH',
                        machineNum: state.pathParameters['num'] ?? '1',
                        color: kPromeshColor,
                      ),
                    ),
                    routes: [
                      GoRoute(
                        path: 'poste/:poste',
                        pageBuilder: (context, state) => NoTransitionPage(
                          child: InfoGeneraleScreen(
                            machine: state.pathParameters['num'] ?? '1',
                            poste: state.pathParameters['poste'] ?? 'matin',
                          ),
                        ),
                        routes: [
                          // Dashboard du poste — étape intermédiaire entre le choix du
                          // poste et la saisie : KPI + graphiques + liste des fiches
                          // (tout calculé côté backend). "+ Nouvelle fiche" est l'unique
                          // point d'entrée vers la route sœur "poste/:poste" ci-dessus
                          // (InfoGeneraleScreen, inchangée).
                          GoRoute(
                            path: 'dashboard',
                            pageBuilder: (context, state) => NoTransitionPage(
                              child: PosteDashboardScreen(
                                machine: state.pathParameters['num'] ?? '1',
                                poste: state.pathParameters['poste'] ?? 'matin',
                              ),
                            ),
                          ),
                          GoRoute(
                            path: 'modules',
                            pageBuilder: (context, state) => NoTransitionPage(
                              child: ModulesGridScreen(
                                machine: state.pathParameters['num'] ?? '1',
                                poste: state.pathParameters['poste'] ?? 'matin',
                                ficheId: state.uri.queryParameters['ficheId'] ?? '',
                              ),
                            ),
                            routes: [
                              // Route "rendement/:id" historique supprimée — l'id se
                              // transmet désormais uniquement via ?ficheId=, comme
                              // tous les autres écrans-module (plus de raccourci
                              // spécial pour Rendement).
                              GoRoute(
                                path: 'rendement',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: RendementScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'observation',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ObservationScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'nc',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: NonConformiteScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'personnel',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: PersonnelScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              // Contrôle Machine — écran unique fusionné : contient
                              // désormais aussi Contrôle Process (14 paramètres) et
                              // Paramètres du Poste (tableaux P1/P2 éditables), qui ne
                              // sont plus des modules/routes indépendants (voir
                              // controle_machine_screen.dart, sections 1/2/3). Dernier
                              // module technique avant Contrôle Qualité, qui clôt le
                              // workflow.
                              GoRoute(
                                path: 'controle-machine',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ControleMachineScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'qualite',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ControleQualiteScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              GoRoute(
                path: 'probar',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: MachineOverviewScreen(
                    title: 'PROBAR',
                    lineRoot: productionProbarRoot,
                    color: kProbarColor,
                  ),
                ),
                routes: [
                  GoRoute(
                    path: 'machine/:num',
                    pageBuilder: (context, state) => NoTransitionPage(
                      child: MachineShiftScreen(
                        line: 'probar',
                        lineLabel: 'PROBAR',
                        machineNum: state.pathParameters['num'] ?? '1',
                        color: kProbarColor,
                      ),
                    ),
                    routes: [
                      GoRoute(
                        path: 'poste/:poste',
                        redirect: (context, state) {
                          // Redirige UNIQUEMENT la route bare /poste/:poste vers /dashboard.
                          // Vérifie state.uri.path (URL cible complète) et NON
                          // state.matchedLocation (qui est le préfixe matché par CE route
                          // et toujours terminé par /poste/:poste même pour les sous-routes).
                          final poste = state.pathParameters['poste'] ?? '';
                          if (state.uri.path.endsWith('/poste/$poste')) {
                            return '${state.matchedLocation}/dashboard';
                          }
                          return null;
                        },
                        pageBuilder: (context, state) => const NoTransitionPage(child: SizedBox.shrink()),
                        routes: [
                          GoRoute(
                            path: 'dashboard',
                            pageBuilder: (context, state) => NoTransitionPage(
                              child: ProbarPosteDashboardScreen(
                                machine: state.pathParameters['num'] ?? '1',
                                poste: state.pathParameters['poste'] ?? 'matin',
                              ),
                            ),
                          ),
                          GoRoute(
                            path: 'detail',
                            pageBuilder: (context, state) => NoTransitionPage(
                              child: ProbarDetailScreen(
                                machine: state.pathParameters['num'] ?? '1',
                                poste: state.pathParameters['poste'] ?? 'matin',
                                id: state.uri.queryParameters['id'] ?? '',
                              ),
                            ),
                          ),
                          GoRoute(
                            path: 'modules',
                            pageBuilder: (context, state) => NoTransitionPage(
                              child: ProbarModulesGridScreen(
                                machine: state.pathParameters['num'] ?? '1',
                                poste: state.pathParameters['poste'] ?? 'matin',
                                ficheId: state.uri.queryParameters['ficheId'] ?? '',
                              ),
                            ),
                            routes: [
                              GoRoute(
                                path: 'rendement',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarRendementScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'personnel',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarPersonnelScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'observation',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarObservationScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'nc',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarNonConformiteScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'controle-machine',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarControleMachineScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'qualite',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarControleQualiteScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                              GoRoute(
                                path: 'parametres-poste',
                                pageBuilder: (context, state) => NoTransitionPage(
                                  child: ProbarParametresPosteScreen(
                                    machine: state.pathParameters['num'] ?? '1',
                                    poste: state.pathParameters['poste'] ?? 'matin',
                                    ficheId: state.uri.queryParameters['ficheId'] ?? '',
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'form',
                    pageBuilder: (context, state) =>
                        const NoTransitionPage(child: ProbarFormScreen()),
                  ),
                ],
              ),
            ],
          ),

          // ── MODULE INDUSTRIEL — MÉLANGE ──────────────────────────────────
          GoRoute(
            path: melangeRoot,
            redirect: (context, state) =>
                AuthService().canViewPorPromesh ? null : dashboard,
            routes: [
              GoRoute(
                path: 'form',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: MelangeFormScreen(id: state.uri.queryParameters['id']),
                ),
              ),
              GoRoute(
                path: 'historique',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: MelangeHistoryScreen()),
              ),
              GoRoute(
                path: 'detail',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: MelangeDetailsScreen(id: state.uri.queryParameters['id'] ?? ''),
                ),
              ),
            ],
          ),

          // ── MODULE INDUSTRIEL — MAINTENANCE ──────────────────────────────
          GoRoute(
            path: maintenanceRoot,
            redirect: (context, state) =>
                AuthService().canViewPorPromesh ? null : dashboard,
            routes: [
              GoRoute(
                path: 'form',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: MaintenanceFormScreen()),
              ),
              GoRoute(
                path: 'historique',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: IndustrialHistoriqueScreen(
                    module: 'maintenance',
                    title: 'MAINTENANCE',
                    color: kMaintenanceColor,
                    newFicheRoute: maintenanceFormScreen,
                    newFicheLabel: 'Nouvelle demande',
                  ),
                ),
              ),
            ],
          ),

          // ── MODULE RH — DEMANDES (congé / autorisation de sortie) ────────
          GoRoute(
            path: hrRoot,
            pageBuilder: (context, state) => const NoTransitionPage(child: HrTypeScreen()),
            routes: [
              GoRoute(
                path: 'historique',
                pageBuilder: (context, state) => const NoTransitionPage(child: HrHistoryScreen()),
              ),
              GoRoute(
                path: 'conge',
                pageBuilder: (context, state) => const NoTransitionPage(child: HrCongeFormScreen()),
              ),
              GoRoute(
                path: 'sortie',
                pageBuilder: (context, state) => const NoTransitionPage(child: HrSortieFormScreen()),
              ),
              GoRoute(
                path: 'detail',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: HrDetailScreen(id: state.uri.queryParameters['id'] ?? ''),
                ),
              ),
              GoRoute(
                path: 'profils',
                redirect: (context, state) {
                  final role = (AuthService().userRole ?? '').toLowerCase().trim();
                  return (role == 'admin' || role == 'superadmin' || role == 'superadmin2') ? null : hrRoot;
                },
                pageBuilder: (context, state) => const NoTransitionPage(child: HrAdminProfileScreen()),
              ),
            ],
          ),

          // ── MODULE RÉCUPÉRABLES ───────────────────────────────────────────
          GoRoute(
            path: recuperableRoot,
            redirect: (context, state) {
              if (state.fullPath == recuperableRoot) return recuperableHistoriqueScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'fiche',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: RecuperableFicheScreen(id: state.uri.queryParameters['id']),
                ),
              ),
              GoRoute(
                path: 'historique',
                pageBuilder: (context, state) => const NoTransitionPage(child: RecuperableHistoryScreen()),
              ),
              GoRoute(
                path: 'detail',
                pageBuilder: (context, state) => NoTransitionPage(
                  child: RecuperableDetailScreen(id: state.uri.queryParameters['id'] ?? ''),
                ),
              ),
              GoRoute(
                path: 'statistiques',
                pageBuilder: (context, state) => const NoTransitionPage(child: RecuperableStatsScreen()),
              ),
            ],
          ),

          // ── DASHBOARD INDUSTRIEL — SUPER ADMIN ────────────────────────────
          GoRoute(
            path: superAdminDashboardScreen,
            redirect: (context, state) {
              // issam@gmail.com n'ouvre jamais le Dashboard Industriel, quel
              // que soit son rôle. cbitunisia@cbi-tunisia.com (root admin) y
              // a accès — c'est même son Dashboard par défaut.
              if (AuthService().hideIndustrialDashboard) return dashboard;
              final role = (AuthService().userRole ?? '').toLowerCase().trim();
              return (role == 'admin' || role == 'superadmin' || role == 'superadmin2') ? null : dashboard;
            },
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: IndustrialSuperAdminDashboardScreen()),
          ),

          // Other
          GoRoute(
            path: chartScreen,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: ChartScreen()),
          ),
          GoRoute(
            path: '/components',
            redirect: (context, state) {
              if (state.fullPath == '/components') return buttonsScreen;
              return null;
            },
            routes: [
              GoRoute(
                path: 'buttons',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: ButtonsScreen()),
              ),
              GoRoute(
                path: 'tabs',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: TabsScreen()),
              ),
              GoRoute(
                path: 'dialog',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: DialogsScreen()),
              ),
              GoRoute(
                path: 'carousel',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: CarouselScreen()),
              ),
              GoRoute(
                path: 'avatar',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: AvtarScreen()),
              ),
              GoRoute(
                path: 'card',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: CardScreen()),
              ),
              GoRoute(
                path: 'rating',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: RattingScreen()),
              ),
              GoRoute(
                path: 'toast',
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: ToastScreen()),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
