import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controller/commercial_selection_controller.dart';
import '../../../services/commercial_selection_api_service.dart';

Future<CommercialUserItem?> showCommercialSelectionDialog(
    BuildContext context) async {
  final controller = Get.put(CommercialSelectionController(), permanent: false);

  final result = await showGeneralDialog<CommercialUserItem>(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    transitionDuration: const Duration(milliseconds: 380),
    transitionBuilder: (ctx, animation, _, child) {
      final curved =
          CurvedAnimation(parent: animation, curve: Curves.easeOutBack);
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeIn),
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.85, end: 1.0).animate(curved),
          child: child,
        ),
      );
    },
    pageBuilder: (ctx, _, __) =>
        _CommercialSelectionDialogContent(controller: controller),
  );

  // Ne pas appeler Get.delete() ici — les Obx du dialog sont encore
  // en cours de démontage. La suppression est gérée dans dispose().
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// StatefulWidget so that Get.delete() is called in dispose(), after all
// Obx subscribers inside the dialog have already unsubscribed.
class _CommercialSelectionDialogContent extends StatefulWidget {
  final CommercialSelectionController controller;
  const _CommercialSelectionDialogContent({required this.controller});

  @override
  State<_CommercialSelectionDialogContent> createState() =>
      _CommercialSelectionDialogContentState();
}

class _CommercialSelectionDialogContentState
    extends State<_CommercialSelectionDialogContent> {
  CommercialSelectionController get controller => widget.controller;

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
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
          child: Material(
            color: cs.surface,
            borderRadius: BorderRadius.circular(28),
            elevation: 8,
            shadowColor: Colors.black38,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ── Header ─────────────────────────────────────
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: cs.primaryContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.business_center_rounded,
                      size: 32,
                      color: cs.onPrimaryContainer,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Choisir votre profil commercial',
                    style: tt.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: cs.onSurface,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Sélectionnez le commercial à utiliser pour cette session',
                    style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),

                  // ── Barre de recherche ─────────────────────────
                  TextField(
                    controller: controller.searchController,
                    decoration: InputDecoration(
                      hintText: 'Rechercher...',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: cs.surfaceContainerHighest,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Liste commerciaux ──────────────────────────
                  Flexible(
                    child: Obx(() {
                      if (controller.isLoading.value) {
                        return const SizedBox(
                          height: 120,
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }
                      if (controller.hasError.value) {
                        return SizedBox(
                          height: 100,
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.error_outline,
                                    color: cs.error, size: 32),
                                const SizedBox(height: 8),
                                Text('Impossible de charger la liste',
                                    style: TextStyle(color: cs.error)),
                              ],
                            ),
                          ),
                        );
                      }
                      final items = controller.filtered;
                      if (items.isEmpty) {
                        return SizedBox(
                          height: 80,
                          child: Center(
                            child: Text('Aucun résultat',
                                style: TextStyle(
                                    color: cs.onSurfaceVariant)),
                          ),
                        );
                      }
                      return ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 300),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: items.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, index) {
                            final user = items[index];
                            return _CommercialCard(
                              user: user,
                              controller: controller,
                            );
                          },
                        ),
                      );
                    }),
                  ),

                  const SizedBox(height: 20),

                  // ── Bouton Confirmer ───────────────────────────
                  Obx(() => AnimatedOpacity(
                        opacity: controller.canConfirm ? 1.0 : 0.4,
                        duration: const Duration(milliseconds: 200),
                        child: SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: FilledButton.icon(
                            onPressed: controller.canConfirm
                                ? controller.confirm
                                : null,
                            icon: const Icon(Icons.check_circle_outline_rounded),
                            label: Obx(() {
                              final name = controller.selectedUser.value?.name;
                              return Text(
                                name != null
                                    ? 'Confirmer : $name'
                                    : 'Confirmer',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600),
                              );
                            }),
                            style: FilledButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                            ),
                          ),
                        ),
                      )),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CommercialCard extends StatelessWidget {
  final CommercialUserItem user;
  final CommercialSelectionController controller;

  const _CommercialCard({required this.user, required this.controller});

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
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Obx(() {
      final isSelected = controller.selectedUser.value?.id == user.id;

      return AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        decoration: BoxDecoration(
          color: isSelected ? cs.primaryContainer : cs.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? cs.primary : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
          onTap: () => controller.selectUser(user),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: isSelected
                      ? cs.primary
                      : cs.secondaryContainer,
                  child: Text(
                    _initials,
                    style: TextStyle(
                      color: isSelected
                          ? cs.onPrimary
                          : cs.onSecondaryContainer,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Row(
                    children: [
                      Icon(
                        Icons.person_outline_rounded,
                        size: 18,
                        color: isSelected
                            ? cs.onPrimaryContainer
                            : cs.onSurfaceVariant,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        user.name,
                        style: tt.bodyLarge?.copyWith(
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: isSelected
                              ? cs.onPrimaryContainer
                              : cs.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  Icon(Icons.check_circle_rounded,
                      color: cs.primary, size: 22),
              ],
            ),
          ),
        ),
      );
    });
  }
}
