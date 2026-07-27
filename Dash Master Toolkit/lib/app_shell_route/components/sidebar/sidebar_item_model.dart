part of 'sidebar_widget.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS (sidebar only)
// ─────────────────────────────────────────────────────────────────────────────
// Sidebar sombre moderne (#0F172A) — les couleurs ci-dessous sont les tons
// "sur fond sombre" (texte clair, bordures slate, hover blanc translucide).
const _kSidebarBg = Color(0xFF0F172A);
const _kPrimary  = Color(0xFF6366F1);
const _kPrimaryL = Color(0xFF818CF8);
const _kHoverBg  = Color(0x14FFFFFF);
const _kTextDark = Color(0xFFE2E8F0);
const _kTextSub  = Color(0xFF94A3B8);
const _kBorderC  = Color(0xFF1E293B);
const _kGroupLbl = Color(0xFF64748B);

// ─────────────────────────────────────────────────────────────────────────────
// MODELS
// ─────────────────────────────────────────────────────────────────────────────
class SidebarItemModel {
  final String           name;
  final IconData         icon;            // Flutter IconData (not SVG)
  final SidebarItemType  sidebarItemType;
  final List<SidebarSubmenuModel>? submenus;
  final String?          navigationPath;
  final bool             isPage;
  final int?             badge;           // optional count badge
  // Couleur d'accent par module (PROMESH/PROBAR/MÉLANGE/MAINTENANCE) —
  // remplace l'indigo par défaut sur la tuile sélectionnée/icône quand défini.
  final Color?           accentColor;

  SidebarItemModel({
    required this.name,
    required this.icon,
    this.sidebarItemType = SidebarItemType.tile,
    this.submenus,
    this.navigationPath,
    this.isPage  = false,
    this.badge,
    this.accentColor,
  }) : assert(
          sidebarItemType != SidebarItemType.submenu ||
              (submenus?.isNotEmpty ?? false),
        );
}

class SidebarSubmenuModel {
  final String   name;
  final String?  navigationPath;
  final bool     isPage;
  final IconData icon;
  final int?     badge;

  SidebarSubmenuModel({
    required this.name,
    this.navigationPath,
    this.isPage = false,
    this.icon   = Icons.circle,
    this.badge,
  });
}

class GroupedMenuModel {
  final String              name;
  final List<SidebarItemModel> menus;
  GroupedMenuModel({required this.name, required this.menus});
}

enum SidebarItemType { tile, submenu }

// ─────────────────────────────────────────────────────────────────────────────
// TOP MENUS  (single Dashboard tile → /kpi = DashboardScreen)
// ─────────────────────────────────────────────────────────────────────────────
List<SidebarItemModel> buildTopMenus({
  required bool isAccueil,
  required bool isCommercial,
  required bool canViewCommercialKpi,
  bool isLogistiqueAchat = false,
  bool canViewPorPromesh = false,
  bool hideIndustrialDashboard = false,
  bool isRestrictedAdmin = false,
}) {
  // Espace dédié module industriel : un seul tile "Dashboard" (cartes KPI),
  // pas le Dashboard CRM (KPI Projets, etc.) qui ne concerne pas ce rôle.
  if (isLogistiqueAchat) {
    return [
      SidebarItemModel(
        name:           'Dashboard',
        icon:           Icons.dashboard_outlined,
        sidebarItemType: SidebarItemType.tile,
        navigationPath: MyRoute.porPromeshDashboardScreen,
      ),
    ];
  }
  if (isAccueil) return [];

  // Commercial : Dashboard avec uniquement KPI Commercial Contacts (pas KPI Projets CRM)
  if (isCommercial) {
    return [
      _safeSubmenuItem(
        name:           'Dashboard',
        icon:           Icons.dashboard_outlined,
        navigationPath: '/dashboard',
        submenus: [
          SidebarSubmenuModel(
            name:           'KPI Commercial Contacts',
            navigationPath: '/users/commercial-contacts-kpi',
            icon:           Icons.people_alt_outlined,
          ),
        ],
      ),
    ];
  }

  // Admin / superadmin / autres : Dashboard avec KPI Projets CRM
  // KPI Commercial Contacts uniquement si le rôle y a accès (admin, superadmin, commercial)
  return [
    _safeSubmenuItem(
      name:           'Dashboard',
      icon:           Icons.dashboard_outlined,
      navigationPath: '/dashboard',
      submenus: [
        SidebarSubmenuModel(
          name:           'KPI Projets CRM',
          navigationPath: 'kpi-projects',
          icon:           Icons.analytics_outlined,
        ),
        if (canViewCommercialKpi)
          SidebarSubmenuModel(
            name:           'KPI Commercial Contacts',
            navigationPath: '/users/commercial-contacts-kpi',
            icon:           Icons.people_alt_outlined,
          ),
        if (canViewPorPromesh && !hideIndustrialDashboard && !isRestrictedAdmin)
          SidebarSubmenuModel(
            name:           'Dashboard Industriel',
            navigationPath: MyRoute.porPromeshDashboardScreen,
            icon:           Icons.precision_manufacturing_outlined,
          ),
      ],
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUPED MENUS  (role-based)
// ─────────────────────────────────────────────────────────────────────────────
List<GroupedMenuModel> buildGroupedMenus({
  required bool isAdmin,
  required bool isCommercial,
  required bool isAccueil,
  bool isLogistiqueAchat = false,
  bool canViewPorPromesh = false,
  bool hideIndustrialDashboard = false,
  bool hideHrAndRecuperables = false,
  bool isRestrictedAdmin = false,
  bool isRootAdmin = false,
}) {
  // ── ESPACE DÉDIÉ — responsable_logistique_achat ─────────────────────────
  // Rien d'autre que le module industriel n'est visible pour ce rôle : pas
  // de Dashboard CRM, KPI, Commercial, Clients, Users ni Administration.
  // RH > Demandes reste accessible — tout employé doit pouvoir demander un
  // congé ou une autorisation de sortie, quel que soit son rôle.
  if (isLogistiqueAchat) {
    return [...buildIndustrialGroups(), buildHrGroup(), buildRecuperableGroup()];
  }

  // ── ACCUEIL ─────────────────────────────────────────────────────────────
  if (isAccueil) {
    return [
      GroupedMenuModel(
        name: 'ACCUEIL',
        menus: [
          SidebarItemModel(
            name:           'Accueil',
            icon:           Icons.home_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.accueilProfileScreen,
          ),
        ],
      ),
    ];
  }

  // ── COMMERCIAL ──────────────────────────────────────────────────────────
  if (isCommercial) {
    return [
      GroupedMenuModel(
        name: 'COMMERCIAL',
        menus: [
          SidebarItemModel(
            name:           'Commercial Contacts',
            icon:           Icons.contact_page_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: '/users/commercial-contacts',
          ),
          SidebarItemModel(
            name:           'KPI Commercial Contacts',
            icon:           Icons.analytics_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: '/users/commercial-contacts-kpi',
          ),
          SidebarItemModel(
            name:           'Commercial Profile',
            icon:           Icons.person_search_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.commercialProfileScreen,
          ),
        ],
      ),
      GroupedMenuModel(
        name: 'MES PROJETS',
        menus: [
          SidebarItemModel(
            name:           'Mes Projets',
            icon:           Icons.folder_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.projectFormScreen,
          ),
        ],
      ),
      GroupedMenuModel(
        name: 'TOOLS',
        menus: [
          SidebarItemModel(
            name:           'Calendar',
            icon:           Icons.calendar_month_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.calendarScreen,
          ),
        ],
      ),
    ];
  }

  // ── DEFAULT (admin / user / superadmin) ─────────────────────────────────
  return [
    GroupedMenuModel(
      name: 'PROJECT MANAGEMENT',
      menus: [
        _safeSubmenuItem(
          name:           'Projects',
          icon:           Icons.folder_copy_outlined,
          navigationPath: '/users',
          submenus: [
            SidebarSubmenuModel(
              name:           'Project Management',
              navigationPath: 'project-list',
              icon:           Icons.account_tree_outlined,
            ),
            SidebarSubmenuModel(
              name:           'Project List',
              navigationPath: 'user_project',
              icon:           Icons.list_alt_outlined,
            ),
            if (isAdmin)
              SidebarSubmenuModel(
                name:           'Commercial List',
                navigationPath: 'commercial-contacts',
                icon:           Icons.handshake_outlined,
              ),
          ],
        ),
      ],
    ),

    if (canViewPorPromesh && !isRestrictedAdmin) ...buildIndustrialGroups(),

    if (isAdmin && !hideIndustrialDashboard && !isRestrictedAdmin)
      GroupedMenuModel(
        name: 'SUPER ADMIN',
        menus: [
          SidebarItemModel(
            name:           'Dashboard Industriel',
            icon:           Icons.dashboard_customize_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.superAdminDashboardScreen,
          ),
        ],
      ),

    if (!hideHrAndRecuperables && !isRestrictedAdmin) buildHrGroup(isAdmin: isAdmin),
    if (!hideHrAndRecuperables && !isRestrictedAdmin) buildRecuperableGroup(),

    // ── ADMINISTRATION > Demandes — "Archivage / Désarchivage" reste réservé à
    // cbitunisia@cbi-tunisia.com, mais "Maintenance" est ouvert à tout
    // utilisateur connecté (chacun crée/consulte ses propres demandes) — le
    // groupe entier n'est donc plus masqué derrière isRootAdmin.
    GroupedMenuModel(
      name: 'ADMINISTRATION',
      menus: [
        _safeSubmenuItem(
          name: 'Demandes',
          icon: Icons.inbox_rounded,
          navigationPath: MyRoute.archiveRequestsScreen,
          submenus: [
            if (isRootAdmin)
              SidebarSubmenuModel(
                name: 'Archivage / Désarchivage',
                navigationPath: MyRoute.archiveRequestsScreen,
                icon: Icons.archive_outlined,
              ),
            SidebarSubmenuModel(
              name: 'Maintenance',
              navigationPath: MyRoute.maintenanceRequestsScreen,
              icon: Icons.build_rounded,
            ),
            SidebarSubmenuModel(
              name: 'RH — Demandes de congé',
              navigationPath: MyRoute.hrCongeRequestsScreen,
              icon: Icons.beach_access_rounded,
            ),
            SidebarSubmenuModel(
              name: 'RH — Demandes d\'autorisation',
              navigationPath: MyRoute.hrSortieRequestsScreen,
              icon: Icons.door_front_door_outlined,
            ),
          ],
        ),
      ],
    ),

    if (isAdmin && !isRestrictedAdmin) ...[
      GroupedMenuModel(
        name: 'USER MANAGEMENT',
        menus: [
          _safeSubmenuItem(
            name:           'Users',
            icon:           Icons.people_alt_outlined,
            navigationPath: '/users',
            submenus: [
              SidebarSubmenuModel(
                name:           'User List',
                navigationPath: 'user-list',
                icon:           Icons.person_outlined,
              ),
              SidebarSubmenuModel(
                name:           'Client',
                navigationPath: 'client',
                icon:           Icons.person_pin_outlined,
              ),
            ],
          ),
        ],
      ),
    ],

    GroupedMenuModel(
      name: 'TOOLS',
      menus: [
        SidebarItemModel(
          name:           'Google Map',
          icon:           Icons.map_outlined,
          navigationPath: MyRoute.mapScreen,
        ),
        SidebarItemModel(
          name:           'Calendar',
          icon:           Icons.calendar_month_outlined,
          navigationPath: MyRoute.calendarScreen,
        ),
      ],
    ),

    if (!isAdmin)
      GroupedMenuModel(
        name: 'MY PROJECTS',
        menus: [
          SidebarItemModel(
            name:           'Projects',
            icon:           Icons.folder_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.projectFormScreen,
          ),
        ],
      ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE INDUSTRIEL — PRODUCTION (PROMESH/PROBAR par machine) / MÉLANGE /
// MAINTENANCE — IA partagée par l'espace dédié et la section admin/superadmin.
// ─────────────────────────────────────────────────────────────────────────────
List<SidebarSubmenuModel> _machineSubmenus(String lineRoot) => List.generate(
      4,
      (i) => SidebarSubmenuModel(
        name:           'Machine ${i + 1}',
        navigationPath: '$lineRoot/machine/${i + 1}',
        icon:           Icons.precision_manufacturing_outlined,
      ),
    );

List<GroupedMenuModel> buildIndustrialGroups() => [
      GroupedMenuModel(
        name: 'PRODUCTION',
        menus: [
          SidebarItemModel(
            name:           'PROMESH',
            icon:           Icons.factory_outlined,
            sidebarItemType: SidebarItemType.submenu,
            navigationPath: MyRoute.productionPromeshRoot,
            accentColor:    kPromeshColor,
            submenus:       _machineSubmenus(MyRoute.productionPromeshRoot),
          ),
          SidebarItemModel(
            name:           'PROBAR',
            icon:           Icons.factory_outlined,
            sidebarItemType: SidebarItemType.submenu,
            navigationPath: MyRoute.productionProbarRoot,
            accentColor:    kProbarColor,
            submenus:       _machineSubmenus(MyRoute.productionProbarRoot),
          ),
        ],
      ),
      GroupedMenuModel(
        name: 'MÉLANGE',
        menus: [
          SidebarItemModel(
            name:           'Nouvelle fiche',
            icon:           Icons.add_circle_outline,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.melangeFormScreen,
            accentColor:    kMelangeColor,
          ),
          SidebarItemModel(
            name:           'Historique',
            icon:           Icons.history_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.melangeHistoriqueScreen,
            accentColor:    kMelangeColor,
          ),
        ],
      ),
      GroupedMenuModel(
        name: 'MAINTENANCE',
        menus: [
          SidebarItemModel(
            name:           'Nouvelle demande',
            icon:           Icons.add_circle_outline,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.maintenanceFormScreen,
            accentColor:    kMaintenanceColor,
          ),
          SidebarItemModel(
            name:           'Historique',
            icon:           Icons.history_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.maintenanceHistoriqueScreen,
            accentColor:    kMaintenanceColor,
          ),
        ],
      ),
    ];

// ─────────────────────────────────────────────────────────────────────────────
// MODULE RH — DEMANDES (congé / autorisation de sortie)
// ─────────────────────────────────────────────────────────────────────────────
GroupedMenuModel buildHrGroup({bool isAdmin = false}) => GroupedMenuModel(
      name: 'RH',
      menus: [
        SidebarItemModel(
          name:           'Nouvelle demande',
          icon:           Icons.add_circle_outline,
          sidebarItemType: SidebarItemType.tile,
          navigationPath: MyRoute.hrRoot,
          accentColor:    kHrColor,
        ),
        SidebarItemModel(
          name:           'Historique',
          icon:           Icons.history_outlined,
          sidebarItemType: SidebarItemType.tile,
          navigationPath: MyRoute.hrHistoriqueScreen,
          accentColor:    kHrColor,
        ),
        if (isAdmin)
          SidebarItemModel(
            name:           'Profils RH',
            icon:           Icons.manage_accounts_outlined,
            sidebarItemType: SidebarItemType.tile,
            navigationPath: MyRoute.hrAdminProfilesScreen,
            accentColor:    kHrColor,
          ),
      ],
    );

// ─────────────────────────────────────────────────────────────────────────────
// MODULE RÉCUPÉRABLES
// ─────────────────────────────────────────────────────────────────────────────
GroupedMenuModel buildRecuperableGroup() => GroupedMenuModel(
      name: 'RÉCUPÉRABLES',
      menus: [
        SidebarItemModel(
          name:           'Nouvelle fiche',
          icon:           Icons.add_circle_outline,
          sidebarItemType: SidebarItemType.tile,
          navigationPath: MyRoute.recuperableFicheScreen,
          accentColor:    kRecuperableColor,
        ),
        SidebarItemModel(
          name:           'Historique',
          icon:           Icons.history_outlined,
          sidebarItemType: SidebarItemType.tile,
          navigationPath: MyRoute.recuperableHistoriqueScreen,
          accentColor:    kRecuperableColor,
        ),
        SidebarItemModel(
          name:           'Statistiques',
          icon:           Icons.bar_chart_outlined,
          sidebarItemType: SidebarItemType.tile,
          navigationPath: MyRoute.recuperableStatsScreen,
          accentColor:    kRecuperableColor,
        ),
      ],
    );

// ─────────────────────────────────────────────────────────────────────────────
// SAFE BUILDER  (prevents assert crash when submenus list is empty)
// ─────────────────────────────────────────────────────────────────────────────
SidebarItemModel _safeSubmenuItem({
  required String   name,
  required IconData icon,
  required String   navigationPath,
  required List<SidebarSubmenuModel> submenus,
}) {
  final clean = submenus.whereType<SidebarSubmenuModel>().toList();
  if (clean.isEmpty) {
    return SidebarItemModel(
      name:           name,
      icon:           icon,
      sidebarItemType: SidebarItemType.tile,
      navigationPath: navigationPath,
    );
  }
  return SidebarItemModel(
    name:           name,
    icon:           icon,
    sidebarItemType: SidebarItemType.submenu,
    navigationPath: navigationPath,
    submenus:       clean,
  );
}
