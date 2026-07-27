import 'package:responsive_framework/responsive_framework.dart' as rf;
import '../common_imports.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';
import 'package:dash_master_toolkit/providers/archive_request_provider.dart';
import 'package:dash_master_toolkit/providers/maintenance_request_provider.dart';
import 'package:dash_master_toolkit/core/theme/app_text_styles.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart'
    show kPromeshColor, kProbarColor, kMelangeColor, kMaintenanceColor;
import 'package:dash_master_toolkit/forms/hr/theme/hr_theme.dart' show kHrColor;
import 'package:dash_master_toolkit/forms/recuperables/theme/recuperable_theme.dart' show kRecuperableColor;

part 'sidebar_item_model.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR  (premium SaaS design)
// ─────────────────────────────────────────────────────────────────────────────
class SideBarWidget extends StatelessWidget {
  const SideBarWidget({
    super.key,
    required this.rootScaffoldKey,
    this.iconOnly = false,
  });

  final GlobalKey<ScaffoldState> rootScaffoldKey;
  final bool iconOnly;

  @override
  Widget build(BuildContext context) {
    final auth    = context.watch<AuthService>();
    final role    = (auth.userRole ?? '').toString().trim().toLowerCase();
    final isAdmin = role == 'admin' || role == 'superadmin' || role == 'superadmin2';
    final isCommercial = role == 'commercial';
    final isAccueil    = role == 'accueil';
    final isLogistiqueAchat = role == 'responsable_logistique_achat';
    final canViewCommercialKpi = auth.canViewCommercialKpi;
    final canViewPorPromesh = auth.canViewPorPromesh;
    final hideIndustrialDashboard = auth.hideIndustrialDashboard;
    final email = (auth.userEmail ?? '').toLowerCase().trim();

    // "user" et "commercial" ne doivent plus voir les groupes RH et
    // Récupérables — inchangé pour tous les autres rôles.
    final bool hideHrAndRecuperables = role == 'user' || role == 'commercial';

    // issam@gmail.com et bayrem@gmail.com — comptes admin-tier restreints à
    // Dashboard/Projects/Tools : aucun menu industriel (Dashboard Industriel,
    // Production/PROMESH/PROBAR, Mélange, Maintenance, Super Admin, RH,
    // Récupérables). cbitunisia@cbi-tunisia.com (root admin) et tout autre
    // compte conservent leur affichage actuel, inchangé.
    final bool isRestrictedAdmin =
        email == 'issam@gmail.com' || email == 'bayrem@gmail.com';

    // Rubrique Administration > Demandes (archivage/désarchivage) —
    // visible uniquement pour cbitunisia@cbi-tunisia.com.
    final bool isRootAdmin = auth.isRootAdmin;

    debugPrint('ROLE CONNECTE = $role');

    final topMenus     = buildTopMenus(
      isAccueil:           isAccueil,
      isCommercial:        isCommercial,
      isLogistiqueAchat:   isLogistiqueAchat,
      canViewCommercialKpi: canViewCommercialKpi,
      canViewPorPromesh:   canViewPorPromesh,
      hideIndustrialDashboard: hideIndustrialDashboard,
      isRestrictedAdmin: isRestrictedAdmin,
    );
    final groupedMenus = buildGroupedMenus(
      isAdmin:      isAdmin,
      isCommercial: isCommercial,
      isAccueil:    isAccueil,
      isLogistiqueAchat: isLogistiqueAchat,
      canViewPorPromesh: canViewPorPromesh,
      hideIndustrialDashboard: hideIndustrialDashboard,
      hideHrAndRecuperables: hideHrAndRecuperables,
      isRestrictedAdmin: isRestrictedAdmin,
      isRootAdmin: isRootAdmin,
    );

    final sidebarW = iconOnly
        ? 80.0
        : rf.ResponsiveValue<double>(
            context,
            defaultValue: 260,
            conditionalValues: [
              rf.Condition.largerThan(name: rf.MOBILE, value: 280),
              rf.Condition.largerThan(name: rf.TABLET, value: 280),
            ],
          ).value;

    return Drawer(
      clipBehavior: Clip.none,
      width: sidebarW,
      child: Container(
        color: _kSidebarBg,
        child: SafeArea(
          child: Column(
            children: [
              // ── HEADER ────────────────────────────────────────────────────
              _SidebarHeader(iconOnly: iconOnly, onTap: () {
                rootScaffoldKey.currentState?.closeDrawer();
                // Le logo ramène toujours au Dashboard Business Intelligence
                // (/dashboard/kpi-projects) — cbitunisia@cbi-tunisia.com y
                // compris (voir my_route.dart redirect : Dashboard Industriel
                // n'est plus la destination par défaut, seulement un lien du
                // menu, toujours accessible via "Dashboard Industriel").
                context.go(MyRoute.dashboardSalesAdmin);
              }),

              // ── MENU LIST ─────────────────────────────────────────────────
              Expanded(
                child: ScrollConfiguration(
                  behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Top menus (Dashboard)
                        ...topMenus.map((menu) {
                          final sel = _isSelected(context, menu);
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: SidebarMenuItem(
                              iconOnly:       iconOnly,
                              menuTile:       menu,
                              groupName:      menu.name,
                              isSelected:     sel.$1,
                              selectedSubmenu: sel.$2,
                              onTap:          () => _handleNavigation(context, menu),
                              onSubmenuTap:   (v) => _handleNavigation(context, menu, submenu: v),
                            ),
                          );
                        }),

                        // Grouped menus
                        ...groupedMenus.map((group) {
                          final visibleMenus = group.menus.where((m) => true).toList();
                          if (visibleMenus.isEmpty) return const SizedBox.shrink();

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Group label
                              if (!iconOnly)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(8, 20, 8, 6),
                                  child: Text(
                                    AppLocalizations.of(context).translate(group.name),
                                    style: AppTextStyles.sidebarGroupLabel,
                                  ),
                                )
                              else
                                const SizedBox(height: 12),

                              // Menu items
                              ...visibleMenus.map((menu) {
                                final sel = _isSelected(context, menu);
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: SidebarMenuItem(
                                    iconOnly:        iconOnly,
                                    menuTile:        menu,
                                    groupName:       menu.name,
                                    isSelected:      sel.$1,
                                    selectedSubmenu: sel.$2,
                                    onTap:           () => _handleNavigation(context, menu),
                                    onSubmenuTap:    (v) => _handleNavigation(context, menu, submenu: v),
                                  ),
                                );
                              }),
                            ],
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ),

              // ── FOOTER ────────────────────────────────────────────────────
              if (!iconOnly) const _SidebarFooter(),
            ],
          ),
        ),
      ),
    );
  }

  // ── Route helpers ──────────────────────────────────────────────────────────
  (bool, SidebarSubmenuModel?) _isSelected(BuildContext context, SidebarItemModel menu) {
    final currentRoute =
        GoRouter.of(context).routerDelegate.currentConfiguration.fullPath;

    if (menu.sidebarItemType == SidebarItemType.submenu) {
      // Cherche le sous-menu actif parmi les submenus, qu'ils soient
      // en chemin relatif ("kpi-projects") ou absolu ("/users/xxx").
      final sub = menu.submenus?.firstWhereOrNull((s) {
        final sPath = (s.navigationPath ?? '').trim();
        if (sPath.isEmpty) return false;
        // Chemin absolu → comparaison directe
        if (sPath.startsWith('/')) {
          return currentRoute == sPath || currentRoute.startsWith('$sPath/');
        }
        // Chemin relatif → préfixe avec le chemin parent
        final full = '${menu.navigationPath ?? ''}/$sPath';
        return currentRoute == full || currentRoute.startsWith('$full/');
      });
      if (sub != null) return (true, sub);

      // Le parent est actif si sa navigationPath est préfixe de la route courante
      final nav = (menu.navigationPath ?? '').trim();
      if (nav.isNotEmpty && currentRoute.startsWith(nav)) return (true, null);
      return (false, null);
    }

    final nav = (menu.navigationPath ?? '').toLowerCase().trim();
    final isSelectedMenu = nav.isNotEmpty ? currentRoute.startsWith(nav) : false;
    return (isSelectedMenu, null);
  }

  void _handleNavigation(BuildContext context, SidebarItemModel menu, {SidebarSubmenuModel? submenu}) {
    rootScaffoldKey.currentState?.closeDrawer();
    String? route;

    if (menu.sidebarItemType == SidebarItemType.tile) {
      route = menu.navigationPath;
    } else if (menu.sidebarItemType == SidebarItemType.submenu) {
      final sPath = (submenu?.navigationPath ?? '').trim();
      if (sPath.isEmpty) return;
      // Chemin absolu → navigation directe sans préfixe parent
      route = sPath.startsWith('/') ? sPath : '${menu.navigationPath ?? ''}/$sPath';
    }

    if (route == null || route.isEmpty) {
      ScaffoldMessenger.of(rootScaffoldKey.currentContext!).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).translate('unknownRoute'))),
      );
      return;
    }
    final current = GoRouter.of(context).routerDelegate.currentConfiguration.fullPath;
    if (current == route) return;
    context.go(route);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR HEADER
// ─────────────────────────────────────────────────────────────────────────────
class _SidebarHeader extends StatelessWidget {
  const _SidebarHeader({required this.iconOnly, required this.onTap});
  final bool iconOnly;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(horizontal: iconOnly ? 12 : 20, vertical: 16),
          decoration: const BoxDecoration(
            color: _kSidebarBg,
            border: Border(bottom: BorderSide(color: _kBorderC)),
          ),
          child: iconOnly
              ? Center(
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [_kPrimary, _kPrimaryL],
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 20),
                  ),
                )
              : Row(children: [
                  // Logo container
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [_kPrimary, _kPrimaryL],
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: SvgPicture.asset(
                      logoIcon,
                      fit: BoxFit.contain,
                      colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          appName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: _kTextDark,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Project Management Platform',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: _kTextSub,
                          ),
                        ),
                      ],
                    ),
                  ),
                ]),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR FOOTER
// ─────────────────────────────────────────────────────────────────────────────
class _SidebarFooter extends StatelessWidget {
  const _SidebarFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: _kBorderC)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Container(
              width: 6, height: 6,
              decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            const Text(
              'Version 2.0.0',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _kTextSub),
            ),
          ]),
          const SizedBox(height: 4),
          const Text(
            'CBI Tunisia © 2026',
            style: TextStyle(fontSize: 10, color: _kGroupLbl),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR MENU ITEM
// ─────────────────────────────────────────────────────────────────────────────
class SidebarMenuItem extends StatelessWidget {
  const SidebarMenuItem({
    super.key,
    this.iconOnly        = false,
    required this.menuTile,
    this.isSelected      = false,
    this.selectedSubmenu,
    this.onSubmenuTap,
    this.onTap,
    this.groupName,
  });

  final bool                           iconOnly;
  final SidebarItemModel               menuTile;
  final bool                           isSelected;
  final SidebarSubmenuModel?           selectedSubmenu;
  final void Function(SidebarSubmenuModel?)? onSubmenuTap;
  final VoidCallback?                  onTap;
  final String?                        groupName;

  @override
  Widget build(BuildContext context) {
    final lang = AppLocalizations.of(context);

    if (menuTile.sidebarItemType == SidebarItemType.submenu) {
      if (iconOnly) {
        return Material(
          color: Colors.transparent,
          clipBehavior: Clip.antiAlias,
          child: PopupMenuButton<SidebarSubmenuModel?>(
            offset: const Offset(80 - 16, 0),
            clipBehavior: Clip.antiAlias,
            tooltip: lang.translate(menuTile.name),
            color: Colors.white,
            elevation: 8,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            itemBuilder: (ctx) => [
              if (groupName != null)
                _CustomIconOnlySubmenu(
                  enabled: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Text(
                      lang.translate(groupName!),
                      // Popup flottant à fond blanc (hors thème sombre de la
                      // sidebar) → texte foncé pour rester lisible.
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1E293B)),
                    ),
                  ),
                ),
              ...?menuTile.submenus?.map((sub) => _CustomIconOnlySubmenu<SidebarSubmenuModel>(
                value: sub,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: _buildSubmenuTile(context, sub,
                      onChanged: (v) { Navigator.pop(ctx, v); onSubmenuTap?.call(v); }),
                ),
              )),
            ],
            child: _buildTile(context, onTap: null),
          ),
        );
      }

      return ExpansionWidget(
        titleBuilder: (aV, eIV, iE, tF) => _buildTile(
          context,
          onTap: () => tF(animated: true),
          isExpanded: iE,
        ),
        initiallyExpanded: isSelected,
        content: Padding(
          padding: const EdgeInsets.only(top: 2, left: 16),
          child: Column(
            children: menuTile.submenus!.map((sub) => _buildSubmenuTile(context, sub, onChanged: onSubmenuTap)).toList(),
          ),
        ),
      );
    }

    if (iconOnly) {
      return Tooltip(
        message: lang.translate(menuTile.name),
        child: _buildTile(context, onTap: onTap),
      );
    }
    return _buildTile(context, onTap: onTap);
  }

  // ── Main tile ──────────────────────────────────────────────────────────────
  Widget _buildTile(
    BuildContext context, {
    required VoidCallback? onTap,
    bool isExpanded = false,
  }) {
    final lang = AppLocalizations.of(context);
    final accent = menuTile.accentColor ?? _kPrimary;
    final accentL = menuTile.accentColor?.withOpacity(0.8) ?? _kPrimaryL;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      height: 56,
      decoration: BoxDecoration(
        gradient: isSelected
            ? LinearGradient(
                colors: [accent, accentL],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              )
            : null,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          hoverColor: isSelected ? Colors.transparent : _kHoverBg,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: iconOnly ? 0 : 14),
            child: Row(
              mainAxisAlignment: iconOnly ? MainAxisAlignment.center : MainAxisAlignment.start,
              children: [
                // Icon
                Icon(
                  menuTile.icon,
                  size: 20,
                  color: isSelected ? Colors.white : (menuTile.accentColor ?? _kTextSub),
                ),
                if (!iconOnly) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      lang.translate(menuTile.name),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? Colors.white : _kTextDark,
                      ),
                    ),
                  ),
                  // Badge — "Demandes" (Administration) affiche le compte
                  // "en attente" en direct (GetX), les autres tuiles gardent
                  // leur badge statique figé au build.
                  if (menuTile.navigationPath == MyRoute.archiveRequestsScreen)
                    Obx(() {
                      final count = ArchiveRequestProvider.to.pendingCount;
                      if (count == 0) return const SizedBox.shrink();
                      return _Badge(count: count, selected: isSelected);
                    })
                  else if (menuTile.badge != null)
                    _Badge(count: menuTile.badge!, selected: isSelected),
                  // Chevron (submenu)
                  if (menuTile.submenus != null)
                    Icon(
                      isExpanded ? Icons.keyboard_arrow_down_rounded : Icons.keyboard_arrow_right_rounded,
                      size: 18,
                      color: isSelected ? Colors.white.withOpacity(0.8) : _kGroupLbl,
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Submenu tile ───────────────────────────────────────────────────────────
  Widget _buildSubmenuTile(
    BuildContext context,
    SidebarSubmenuModel sub, {
    void Function(SidebarSubmenuModel?)? onChanged,
  }) {
    final lang    = AppLocalizations.of(context);
    final isSelSub = selectedSubmenu == sub;
    final accent = menuTile.accentColor ?? _kPrimary;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      height: 44,
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color:         isSelSub ? accent.withOpacity(0.1) : Colors.transparent,
        borderRadius:  BorderRadius.circular(10),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: () => onChanged?.call(sub),
          borderRadius: BorderRadius.circular(10),
          hoverColor: accent.withOpacity(0.1),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              Icon(
                sub.icon,
                size: 16,
                color: isSelSub ? accent : _kGroupLbl,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  lang.translate(sub.name),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelSub ? FontWeight.w700 : FontWeight.w500,
                    color: isSelSub ? accent : _kTextSub,
                  ),
                ),
              ),
              // "Maintenance" (Demandes) affiche le compte "en attente" en
              // direct (GetX), les autres sous-menus gardent leur badge
              // statique figé au build.
              if (sub.navigationPath == MyRoute.maintenanceRequestsScreen)
                Obx(() {
                  final count = MaintenanceRequestProvider.to.pendingCount;
                  if (count == 0) return const SizedBox.shrink();
                  return _Badge(count: count, selected: false);
                })
              else if (sub.badge != null)
                _Badge(count: sub.badge!, selected: false),
            ]),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE WIDGET
// ─────────────────────────────────────────────────────────────────────────────
class _Badge extends StatelessWidget {
  const _Badge({required this.count, required this.selected});
  final int  count;
  final bool selected;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(right: 4),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(
      color: selected ? Colors.white.withOpacity(0.25) : _kPrimary.withOpacity(0.18),
      borderRadius: BorderRadius.circular(50),
    ),
    child: Text(
      count > 999 ? '999+' : '$count',
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: selected ? Colors.white : _kPrimaryL,
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ICON-ONLY POPUP SUBMENU ENTRY
// ─────────────────────────────────────────────────────────────────────────────
class _CustomIconOnlySubmenu<T> extends StatefulWidget implements PopupMenuEntry<T> {
  const _CustomIconOnlySubmenu({
    super.key,
    this.enabled = true,
    this.value,
    required this.child,
  });

  final bool    enabled;
  final T?      value;
  final Widget  child;

  @override
  State<_CustomIconOnlySubmenu> createState() => _CustomIconOnlySubmenuState<T>();

  @override
  double get height => 0;

  @override
  bool represents(value) => value == this.value;
}

class _CustomIconOnlySubmenuState<T> extends State<_CustomIconOnlySubmenu<T>> {
  void handleTap() => Navigator.pop<T>(context, widget.value);

  @override
  Widget build(BuildContext context) => InkWell(
    hoverColor: _kHoverBg,
    onTap: widget.enabled ? handleTap : null,
    child: widget.child,
  );
}
