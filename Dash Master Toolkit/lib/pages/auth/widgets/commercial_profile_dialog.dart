import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controller/commercial_profile_controller.dart';
import '../../../services/commercial_profile_api_service.dart';

/// Affiche la dialog de sélection commerciale (email @probardistribution.com).
/// - [barrierDismissible] = false : l'utilisateur DOIT choisir.
/// - Retourne le nom sélectionné, ou null si fermée sans confirmation.
Future<String?> showCommercialProfileDialog(BuildContext screenContext) async {
  final ctrl = Get.put(CommercialProfileController());

  String? selectedName;

  await showGeneralDialog<void>(
    context: screenContext,
    barrierDismissible: false,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    transitionDuration: const Duration(milliseconds: 380),
    transitionBuilder: (_, anim, __, child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
      return FadeTransition(
        opacity: CurvedAnimation(parent: anim, curve: Curves.easeIn),
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.88, end: 1.0).animate(curved),
          child: child,
        ),
      );
    },
    pageBuilder: (dialogCtx, _, __) => _CommercialProfileDialogWidget(
      ctrl: ctrl,
      onConfirmed: (name) {
        selectedName = name;
        if (screenContext.mounted) {
          ScaffoldMessenger.of(screenContext).showSnackBar(
            SnackBar(
              content: Text('Commercial sélectionné : $name'),
              behavior: SnackBarBehavior.floating,
              backgroundColor: Colors.green.shade700,
              duration: const Duration(seconds: 2),
            ),
          );
        }
        Navigator.of(dialogCtx).pop();
      },
    ),
  );

  // Ne pas appeler Get.delete() ici — les Obx du dialog sont encore
  // en cours de démontage. La suppression est gérée dans dispose().
  return selectedName;
}

// ─────────────────────────────────────────────────────────────────────────────
// StatefulWidget so that Get.delete() is called in dispose(), after all
// Obx subscribers inside the dialog have already unsubscribed.
class _CommercialProfileDialogWidget extends StatefulWidget {
  final CommercialProfileController ctrl;
  final void Function(String name) onConfirmed;

  const _CommercialProfileDialogWidget({
    required this.ctrl,
    required this.onConfirmed,
  });

  @override
  State<_CommercialProfileDialogWidget> createState() =>
      _CommercialProfileDialogWidgetState();
}

class _CommercialProfileDialogWidgetState
    extends State<_CommercialProfileDialogWidget> {
  CommercialProfileController get ctrl => widget.ctrl;
  void Function(String) get onConfirmed => widget.onConfirmed;

  @override
  void dispose() {
    // Called after all child Obx widgets have unsubscribed — safe to delete.
    if (Get.isRegistered<CommercialProfileController>()) {
      Get.delete<CommercialProfileController>(force: true);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 480,
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Material(
            color: cs.surface,
            borderRadius: BorderRadius.circular(28),
            elevation: 10,
            shadowColor: Colors.black38,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ── Icône ─────────────────────────────────────────────────
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

                  // ── Titre ─────────────────────────────────────────────────
                  Text(
                    'Sélection du commercial',
                    style: tt.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: cs.onSurface,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Choisissez ou créez votre profil commercial',
                    style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),

                  // ── Liste des profils ──────────────────────────────────────
                  Flexible(
                    child: Obx(() {
                      if (ctrl.isLoading.value) {
                        return const SizedBox(
                          height: 100,
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }

                      if (ctrl.hasError.value) {
                        return _ErrorSection(onRetry: ctrl.loadProfiles);
                      }

                      if (ctrl.profiles.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            'Aucun commercial disponible',
                            style: tt.bodyMedium
                                ?.copyWith(color: cs.onSurfaceVariant),
                          ),
                        );
                      }

                      return ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 260),
                        child: ListView.builder(
                          shrinkWrap: true,
                          itemCount: ctrl.profiles.length,
                          itemBuilder: (_, i) =>
                              _ProfileTile(profile: ctrl.profiles[i], ctrl: ctrl),
                        ),
                      );
                    }),
                  ),

                  const SizedBox(height: 8),
                  Divider(color: cs.outlineVariant),
                  const SizedBox(height: 8),

                  // ── Ajout nouveau commercial ───────────────────────────────
                  _AddSection(ctrl: ctrl, cs: cs, tt: tt),

                  const SizedBox(height: 20),

                  // ── Bouton Confirmer ───────────────────────────────────────
                  Obx(() {
                    ctrl.selected.value;
                    ctrl.newNameText.value;

                    final enabled = ctrl.canConfirm;

                    return SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton.icon(
                        onPressed: enabled
                            ? () {
                                final saved = ctrl.confirm();
                                if (saved != null) onConfirmed(saved);
                              }
                            : null,
                        icon: const Icon(Icons.check_circle_outline_rounded),
                        label: Text(
                          ctrl.confirmLabel,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 15),
                        ),
                        style: FilledButton.styleFrom(
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _ProfileTile extends StatelessWidget {
  final CommercialProfile profile;
  final CommercialProfileController ctrl;

  const _ProfileTile({required this.profile, required this.ctrl});

  String get _initials {
    final parts = profile.name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return profile.name.isNotEmpty
        ? profile.name.substring(0, profile.name.length.clamp(0, 2)).toUpperCase()
        : '?';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Obx(() {
      final isSelected = ctrl.selected.value?.id == profile.id;

      return AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(bottom: 6),
        decoration: BoxDecoration(
          color: isSelected ? cs.primaryContainer : cs.surfaceContainerLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? cs.primary : Colors.transparent,
            width: 2,
          ),
        ),
        child: InkWell(
          onTap: () => ctrl.selected.value = profile,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(
                  isSelected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded,
                  color: isSelected ? cs.primary : cs.onSurfaceVariant,
                  size: 22,
                ),
                const SizedBox(width: 12),
                CircleAvatar(
                  radius: 18,
                  backgroundColor:
                      isSelected ? cs.primary : cs.secondaryContainer,
                  child: Text(
                    _initials,
                    style: TextStyle(
                      color:
                          isSelected ? cs.onPrimary : cs.onSecondaryContainer,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  profile.name,
                  style: TextStyle(
                    fontWeight:
                        isSelected ? FontWeight.w700 : FontWeight.w500,
                    color:
                        isSelected ? cs.onPrimaryContainer : cs.onSurface,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                if (isSelected)
                  Icon(Icons.check_circle_rounded,
                      color: cs.primary, size: 20),
              ],
            ),
          ),
        ),
      );
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _AddSection extends StatelessWidget {
  final CommercialProfileController ctrl;
  final ColorScheme cs;
  final TextTheme tt;

  const _AddSection({
    required this.ctrl,
    required this.cs,
    required this.tt,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Autre commercial',
          style: tt.labelLarge?.copyWith(
            color: cs.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: ctrl.newNameController,
          decoration: InputDecoration(
            hintText: 'Saisir un nom personnalisé...',
            filled: true,
            fillColor: cs.surfaceContainerHighest,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            prefixIcon: Icon(Icons.person_add_outlined,
                color: cs.onSurfaceVariant, size: 20),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          ),
          onChanged: (_) => ctrl.selected.value = null,
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
class _ErrorSection extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorSection({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 100,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_rounded, color: cs.error, size: 32),
          const SizedBox(height: 8),
          Text('Impossible de charger les profils',
              style: TextStyle(color: cs.error)),
          TextButton(
            onPressed: onRetry,
            child: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }
}
