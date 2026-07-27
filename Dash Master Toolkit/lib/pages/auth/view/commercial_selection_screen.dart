import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import '../controller/commercial_selection_controller.dart';
import '../../../route/my_route.dart';
import '../../../services/commercial_selection_api_service.dart';

class CommercialSelectionScreen extends StatefulWidget {
  const CommercialSelectionScreen({super.key});

  @override
  State<CommercialSelectionScreen> createState() =>
      _CommercialSelectionScreenState();
}

class _CommercialSelectionScreenState
    extends State<CommercialSelectionScreen> {
  late final CommercialSelectionController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = Get.put(CommercialSelectionController());
  }

  @override
  void dispose() {
    // Called after all child Obx widgets have unsubscribed — safe to delete.
    if (Get.isRegistered<CommercialSelectionController>()) {
      Get.delete<CommercialSelectionController>(force: true);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SizedBox.expand(
        child: Stack(
          children: [
            // ── Fond image (même que login) ───────────────────────────────
            Positioned.fill(
              child: Image.asset(
                'assets/images/login_bg.png',
                fit: BoxFit.cover,
              ),
            ),
            // ── Overlay sombre ───────────────────────────────────────────
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.black.withValues(alpha: 0.75),
                      Colors.black.withValues(alpha: 0.50),
                      Colors.black.withValues(alpha: 0.30),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
              ),
            ),
            // ── Card centrale ─────────────────────────────────────────────
            Center(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    constraints: const BoxConstraints(maxWidth: 500),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.20),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.30),
                          blurRadius: 30,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: _CardContent(ctrl: _ctrl),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _CardContent extends StatelessWidget {
  final CommercialSelectionController ctrl;
  const _CardContent({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Icône ──────────────────────────────────────────────────────
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white30, width: 1.5),
              ),
              child: const Icon(
                Icons.business_center_rounded,
                size: 34,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 18),

            // ── Titre ──────────────────────────────────────────────────────
            const Text(
              'Choisir votre profil commercial',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            const Text(
              'Sélectionnez le commercial à utiliser pour cette session',
              style: TextStyle(color: Colors.white70, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),

            // ── Recherche ──────────────────────────────────────────────────
            TextField(
              controller: ctrl.searchController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Rechercher...',
                hintStyle: const TextStyle(color: Colors.white54),
                prefixIcon:
                    const Icon(Icons.search_rounded, color: Colors.white54),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.08),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // ── Liste commerciaux ──────────────────────────────────────────
            Obx(() {
              if (ctrl.isLoading.value) {
                return const SizedBox(
                  height: 100,
                  child: Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
                );
              }

              if (ctrl.hasError.value) {
                return _ErrorView(onRetry: ctrl.reload);
              }

              final items = ctrl.filtered;

              return Column(
                children: [
                  if (items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        'Aucun résultat',
                        style: TextStyle(color: Colors.white54),
                      ),
                    )
                  else
                    ...items.map((u) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _CommercialCard(user: u, ctrl: ctrl),
                        )),

                  // ── Autre commercial ────────────────────────────────────
                  _AutreCommercialCard(ctrl: ctrl),
                ],
              );
            }),

            const SizedBox(height: 20),

            // ── Bouton Confirmer ───────────────────────────────────────────
            Obx(() {
              final name = ctrl.finalName;
              final enabled = ctrl.canConfirm;

              return AnimatedOpacity(
                opacity: enabled ? 1.0 : 0.45,
                duration: const Duration(milliseconds: 200),
                child: SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: enabled
                        ? () {
                            final ok = ctrl.confirm();
                            if (ok && context.mounted) {
                              context.go(MyRoute.commercialContactsKpiUsers);
                            }
                          }
                        : null,
                    icon: const Icon(Icons.check_circle_outline_rounded,
                        color: Colors.white),
                    label: Text(
                      name != null ? 'Confirmer : $name' : 'Confirmer',
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blueAccent.shade700,
                      disabledBackgroundColor:
                          Colors.blueAccent.withValues(alpha: 0.3),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _CommercialCard extends StatelessWidget {
  final CommercialUserItem user;
  final CommercialSelectionController ctrl;
  const _CommercialCard({required this.user, required this.ctrl});

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return user.name.isNotEmpty
        ? user.name.substring(0, user.name.length.clamp(0, 2)).toUpperCase()
        : '?';
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final isSelected =
          !ctrl.isCustomMode.value && ctrl.selectedUser.value?.id == user.id;

      return AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: isSelected
              ? Colors.blueAccent.withValues(alpha: 0.30)
              : Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected
                ? Colors.blueAccent
                : Colors.white.withValues(alpha: 0.15),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: InkWell(
          onTap: () => ctrl.selectUser(user),
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            child: Row(
              children: [
                // Avatar initiales
                CircleAvatar(
                  radius: 22,
                  backgroundColor: isSelected
                      ? Colors.blueAccent
                      : Colors.white.withValues(alpha: 0.15),
                  child: Text(
                    _initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: 14),

                // Icône + nom
                const Icon(Icons.person_outline_rounded,
                    size: 18, color: Colors.white60),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    user.name,
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight:
                          isSelected ? FontWeight.w700 : FontWeight.w500,
                      fontSize: 15,
                    ),
                  ),
                ),

                // Check
                if (isSelected)
                  const Icon(Icons.check_circle_rounded,
                      color: Colors.blueAccent, size: 22),
              ],
            ),
          ),
        ),
      );
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _AutreCommercialCard extends StatelessWidget {
  final CommercialSelectionController ctrl;
  const _AutreCommercialCard({required this.ctrl});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final isActive = ctrl.isCustomMode.value;

      return Column(
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                Expanded(child: Divider(color: Colors.white24)),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Text('ou', style: TextStyle(color: Colors.white54)),
                ),
                Expanded(child: Divider(color: Colors.white24)),
              ],
            ),
          ),

          // Carte "Autre commercial"
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            decoration: BoxDecoration(
              color: isActive
                  ? Colors.white.withValues(alpha: 0.12)
                  : Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isActive
                    ? Colors.white54
                    : Colors.white.withValues(alpha: 0.15),
                width: isActive ? 1.5 : 1,
              ),
            ),
            child: InkWell(
              onTap: ctrl.toggleCustomMode,
              borderRadius: BorderRadius.circular(14),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          child: const Icon(Icons.edit_outlined,
                              color: Colors.white70, size: 20),
                        ),
                        const SizedBox(width: 14),
                        const Icon(Icons.person_add_outlined,
                            size: 18, color: Colors.white60),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Autre commercial',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        Icon(
                          isActive
                              ? Icons.keyboard_arrow_up_rounded
                              : Icons.keyboard_arrow_down_rounded,
                          color: Colors.white54,
                        ),
                      ],
                    ),

                    // Champ texte affiché si mode actif
                    if (isActive) ...[
                      const SizedBox(height: 14),
                      TextField(
                        controller: ctrl.customNameController,
                        autofocus: true,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: 'Ex : ahmed, salah...',
                          hintStyle: const TextStyle(color: Colors.white38),
                          filled: true,
                          fillColor: Colors.white.withValues(alpha: 0.08),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide.none,
                          ),
                          prefixIcon: const Icon(Icons.keyboard_rounded,
                              color: Colors.white38, size: 20),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 12),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 120,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.wifi_off_rounded, color: Colors.white54, size: 32),
          const SizedBox(height: 8),
          const Text('Impossible de charger la liste',
              style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 10),
          TextButton(
            onPressed: onRetry,
            child: const Text('Réessayer',
                style: TextStyle(color: Colors.blueAccent)),
          ),
        ],
      ),
    );
  }
}
