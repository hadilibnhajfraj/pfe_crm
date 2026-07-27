// lib/forms/view/project_form_screen.dart
//
// Project wizard shell — 5-step form.
//
// GetX rules applied:
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │  ROOT CAUSE OF THE ORIGINAL ERROR                                      │
//   │  Obx(() => Row([_typeChip(...), ...])) had zero .obs reads inside the  │
//   │  builder — GetX throws "improper use" when Obx subscribes to nothing.  │
//   │  FIX: each _TypeChip widget owns its own Obx internally. The Row is    │
//   │  now a plain widget — no outer Obx wrapper needed.                     │
//   └─────────────────────────────────────────────────────────────────────────┘
//
//   • setState() is used ONLY for _currentStep (PageController navigation)
//     and _loading (initial edit-load overlay). Everything else is reactive
//     via the controller or ValueListenableBuilder.
//
//   • Section widgets are StatelessWidgets that use Obx internally — they are
//     never wrapped in an outer Obx here.
//
//   • File upload state (fileBytes, fileName) lives in the controller as Rxn
//     so ActionSection can render reactively and the submit logic reads it.

import 'dart:convert';
import 'package:dash_master_toolkit/application/users/controller/user_grid_controller.dart';
import 'package:dash_master_toolkit/application/users/model/project_grid_data.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart' as dio;

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/theme/theme_controller.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';

import '../controller/project_form_controller.dart';
import '../providers/pipeline_provider.dart';
import '../../providers/api_client.dart';
import 'package:dash_master_toolkit/providers/auth_service.dart';

import 'sections/general_section.dart';
import 'sections/details_section.dart';
import 'sections/contacts_section.dart';
import 'sections/location_section.dart';
import 'sections/action_section.dart';
import 'widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

// ── Wizard step descriptor ────────────────────────────────────────────────────

class _WizardStep {
  final String title;
  final IconData icon;

  const _WizardStep({required this.title, required this.icon});
}

const _kSteps = <_WizardStep>[
  _WizardStep(title: 'General',  icon: Icons.info_outline_rounded),
  _WizardStep(title: 'Details',  icon: Icons.tune_rounded),
  _WizardStep(title: 'Contacts', icon: Icons.people_outline_rounded),
  _WizardStep(title: 'Location', icon: Icons.location_on_outlined),
  _WizardStep(title: 'Action',   icon: Icons.send_outlined),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class ProjectFormScreen extends StatefulWidget {
  const ProjectFormScreen({super.key});

  @override
  State<ProjectFormScreen> createState() => _ProjectFormScreenState();
}

class _ProjectFormScreenState extends State<ProjectFormScreen> {
  // ── GetX controllers ──────────────────────────────────────────────────────
  late final ProjectFormController c;

  // ── UI-only state (drives PageController / loading overlay) ───────────────
  final _pageCtrl = PageController();
  int _currentStep = 0;
  bool _loading = false;
  bool _submitting = false;
  bool _loadedOnce = false;
  String? _projectId;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<ProjectFormController>()
        ? Get.find<ProjectFormController>()
        : Get.put(ProjectFormController());

    if (!Get.isRegistered<ThemeController>()) {
      Get.put(ThemeController());
    }
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    if (Get.isRegistered<ProjectFormController>()) {
      Get.delete<ProjectFormController>();
    }
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loadedOnce) return;
    _loadedOnce = true;

    final id = GoRouterState.of(context).uri.queryParameters['id'];
    if (id != null && id.isNotEmpty) {
      _projectId = id;
      _loadForEdit(id);
    } else {
      _projectId = null;
      c.resetForm();
    }
  }

  Future<void> _loadForEdit(String id) async {
    setState(() => _loading = true);
    try {
      await c.loadProject(id);
      if (c.statut.text.trim().isEmpty) c.statut.text = '';
      if (c.validationStatut.text.trim().isEmpty) {
        c.validationStatut.text = 'Non validé';
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Loading error')}: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  void _goNext() {
    if (_currentStep < _kSteps.length - 1) {
      _pageCtrl.nextPage(
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeInOut);
      setState(() => _currentStep++);
    }
  }

  void _goBack() {
    if (_currentStep > 0) {
      _pageCtrl.previousPage(
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeInOut);
      setState(() => _currentStep--);
    }
  }

  // ── Refresh card colors after devis/BC upload ──────────────────────────────
  Future<void> _refreshCardColors() async {
    if (_projectId == null) return;
    if (Get.isRegistered<UserGridController>()) {
      await UserGridController.to.refreshProjectById(_projectId!);
    }
    await c.loadProject(_projectId!);
    if (mounted) setState(() {});
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  DateTime? _parseDate(String? input) {
    if (input == null || input.isEmpty) return null;
    // Try yyyy-MM-dd first (new display format, same as Visit Date)
    try {
      return DateFormat('yyyy-MM-dd').parseStrict(input);
    } catch (_) {}
    // Fallback: legacy dd/MM/yyyy stored in older projects
    try {
      return DateFormat('dd/MM/yyyy').parseStrict(input);
    } catch (_) {
      return null;
    }
  }

  Future<void> _submit({required bool goBackAfterSave}) async {
    if (_submitting) return;

    String? clean(String v) {
      final t = v.trim();
      return t.isEmpty ? null : t;
    }

    final ok = c.formKey.currentState?.validate() ?? false;
    if (!ok) return;

    if (c.isProject && !c.hasLocation) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Location is required'))));
      return;
    }

    // A file was attached but no action type selected — block before any API call.
    if (c.fileBytes.value != null && c.selectedAction.value == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context)
              .translate('Please select an action type for the file upload'))));
      return;
    }

    setState(() => _submitting = true);

    final currentUser = Get.find<AuthService>().getUserName();

    final payload = {
      'nomProjet'             : clean(c.nomProjet.text),
      'projectModele'         : c.projectModele.value,
      // Send dateDemarrage for ALL types (project, revendeur, applicateur)
      'dateDemarrage'         : clean(c.dateDemarrage.text),
      'statut'                : c.isProject ? clean(c.statut.text) : null,
      'typeAdresseChantier'   : c.isProject ? clean(c.typeAdresseChantier.text) : null,
      'adresse'               : (c.isProject || c.isApplicateur)
          ? clean(c.localisationAdresse.text) : null,
      'location'              : c.isProject
          ? {'lat': c.latitude.value, 'lng': c.longitude.value} : null,
      'typeProjet'            : c.isProject ? clean(c.typeProjet.text) : null,
      'productFamily'         : c.isProject ? c.productFamily.value : null,
      'diameterMm'            : c.isProject ? c.diameterMm.value : null,
      'pourcentageReussite'   : c.isProject ? c.pourcentageReussiteValue : null,
      'surfaceProspectee'     : c.isProject ? c.surfaceProspecteeValue : null,
      'entreprise'            : c.isProject ? clean(c.entreprise.text) : null,
      'promoteur'             : c.isProject ? clean(c.promoteur.text) : null,
      'bureauEtude'           : c.isProject ? clean(c.bureauEtude.text) : null,
      'bureauControle'        : c.isProject ? clean(c.bureauControle.text) : null,
      'entrepriseFluide'      : c.isProject ? clean(c.entrepriseFluide.text) : null,
      'entrepriseElectricite' : c.isProject ? clean(c.entrepriseElectricite.text) : null,
      'ingenieurResponsable'  : c.isProject ? clean(c.ingenieurResponsable.text) : null,
      'telephoneIngenieur'    : c.isProject ? clean(c.telephoneIngenieur.text) : null,
      'emailIngenieur'        : c.isProject ? clean(c.emailIngenieur.text) : null,
      'architecte'            : c.isProject ? clean(c.architecte.text) : null,
      'telephoneArchitecte'   : c.isProject ? clean(c.telephoneArchitecte.text) : null,
      'emailArchitecte'       : c.isProject ? clean(c.emailArchitecte.text) : null,
      // Revendeur
      'comptoir'              : c.isRevendeur ? clean(c.comptoir.text) : null,
      'telephoneComptoir'     : c.isRevendeur ? clean(c.telephoneComptoir.text) : null,
      'telephoneComptoir2'    : c.isRevendeur ? clean(c.telephoneComptoir2.text) : null,
      'registreCommerce'      : c.isRevendeur ? clean(c.registreCommerce.text) : null,
      'fonction'              : c.isRevendeur ? clean(c.fonction.text) : null,
      'revendeurNom'          : c.isRevendeur ? clean(c.revendeurNom.text) : null,
      'revendeurPrenom'       : c.isRevendeur ? clean(c.revendeurPrenom.text) : null,
      'revendeurEmail'        : c.isRevendeur ? clean(c.revendeurEmail.text) : null,
      'revendeurStatut'       : c.isRevendeur ? c.revendeurStatut.text : null,
      'adresseRevendeur'      : c.isRevendeur ? clean(c.adresseRevendeur.text) : null,
      // Applicateur
      'dallagiste'            : c.isApplicateur ? clean(c.dallagiste.text) : null,
      'telephoneDallagiste'   : c.isApplicateur ? clean(c.telephoneDallagiste.text) : null,
      'emailDallagiste'       : c.isApplicateur ? clean(c.emailDallagiste.text) : null,
      'serviceTechnique'      : c.isApplicateur ? clean(c.serviceTechnique.text) : null,
      'matriculeFiscale'      : c.isApplicateur ? clean(c.matriculeFiscale.text) : null,
      // Global
      'montantMarche'          : clean(c.montantMarche.text),
      'validationStatut'       : clean(c.validationStatut.text) ?? 'Non validé',
      'visitDate'              : clean(c.dateVisite.text),
      'localisationCommentaire': clean(c.commentaireCtrl.text),
      'user_nom'               : currentUser,
    };

    // ── CREATE-only fields (cause duplicate-action constraint on UPDATE) ──────
    // firstAction / dateVisite / commentaireAction must NOT be sent on PUT.
    if (_projectId == null) {
      payload['dateVisite']       = clean(c.dateVisite.text);
      payload['firstAction']      = c.selectedAction.value;
      payload['commentaireAction']= clean(c.commentaireCtrl.text);
    } else {
      // Verify no action fields leak into the UPDATE body
      debugPrint('[UPDATE] PUT /projects/$_projectId payload = '
          '${jsonEncode(payload)}');
    }

    try {
      dynamic data;
      if (_projectId == null) {
        // ── CREATE ────────────────────────────────────────────────────────────
        final res =
            await ApiClient.instance.dio.post('/projects', data: payload);
        data = res.data;
        final projectId = data['id'];
        if (c.selectedAction.value != null) {
          final actionType = c.selectedAction.value!;
          final fd = dio.FormData();
          fd.fields.addAll([
            MapEntry('typeAction',        actionType),
            MapEntry('typeAction_legacy', actionType),
            MapEntry('firstAction',       actionType),
            MapEntry('commentaire',       c.commentaireCtrl.text.trim()),
            MapEntry('dateAction',        DateTime.now().toIso8601String()),
          ]);
          if (c.fileBytes.value != null) {
            fd.files.add(MapEntry(
              'file',
              dio.MultipartFile.fromBytes(
                  c.fileBytes.value!, filename: c.fileName.value ?? 'file'),
            ));
          }
          await ApiClient.instance.dio.post(
              '/projects/$projectId/actions', data: fd);
        }
      } else {
        // ── UPDATE ────────────────────────────────────────────────────────────
        // Only PUT the project document. No new action is created here —
        // that avoids duplicate_key_value on project_actions_unique_idx.
        final res = await ApiClient.instance.dio
            .put('/projects/$_projectId', data: payload);
        data = res.data;
      }

      // Unwrap API envelope {success:true, data:{...}} → use inner object.
      // Without this, ProjectGridData.fromJson receives the wrapper map and
      // user_nom / ownerName are missing → owner shows "Unknown".
      final raw        = data as Map;
      final projectMap = (raw['data'] is Map)
          ? Map<String, dynamic>.from(raw['data'] as Map)
          : Map<String, dynamic>.from(raw);

      final gridCtrl = Get.isRegistered<UserGridController>()
          ? Get.find<UserGridController>()
          : Get.put(UserGridController(), permanent: true);

      // For UPDATE: PUT responses often omit owner + permission fields.
      // Preserve them from the local copy so the UI never shows "Unknown"
      // or loses edit controls while refreshProjectById is still pending.
      if (_projectId != null) {
        final old = gridCtrl.projects.firstWhereOrNull((x) => x.id == _projectId);
        if (old != null) {
          if (old.ownerName.isNotEmpty && old.ownerName != 'Unknown') {
            projectMap['user_nom']  ??= old.ownerName;
            projectMap['ownerName'] ??= old.ownerName;
          }
          // 'viewer' is the fromJson default when 'permission' is absent.
          // Restore the real permission so canEdit stays correct.
          if (old.permission.isNotEmpty && old.permission != 'viewer') {
            projectMap['permission'] ??= old.permission;
          }
        }
      }

      final project  = ProjectGridData.fromJson(projectMap);
      gridCtrl.upsertProject(project);
      gridCtrl.forceRefresh();
      if (project.id != null && project.id!.isNotEmpty) {
        await gridCtrl.refreshProjectById(project.id!);
      }

      // Reload pipeline board from server so owner is always taken from
      // the backend response — never from a null local placeholder.
      if (Get.isRegistered<PipelineProvider>()) {
        Get.find<PipelineProvider>().load(silent: true);
      }

      if (_projectId == null) {
        setState(() => _projectId = project.id);
        await c.loadProject(project.id);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(AppLocalizations.of(context).translate('Project created successfully'))));
        if (goBackAfterSave) context.go(MyRoute.userGridScreen);
        c.clearFile();
        return;
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Project updated successfully'))));
      if (goBackAfterSave) context.go(MyRoute.userGridScreen);
      c.clearFile();
    } on dio.DioException catch (e) {
      if (!mounted) return;
      final respData = e.response?.data;
      String msg = e.message ?? AppLocalizations.of(context).translate('Request failed');
      if (respData is Map) {
        msg = respData['message']?.toString()
            ?? respData['error']?.toString()
            ?? msg;
      } else if (respData is String && respData.isNotEmpty) {
        msg = respData;
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Error')}: $msg'),
          backgroundColor: Colors.red.shade700));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${AppLocalizations.of(context).translate('Error')}: $e'),
          backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
          body: Center(child: CircularProgressIndicator()));
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final isMobile = screenWidth < 992;

    return Scaffold(
      backgroundColor: kCrmBg,
      body: Column(children: [
        _WizardHeader(
          steps:       _kSteps,
          currentStep: _currentStep,
          projectId:   _projectId,
        ),
        Expanded(
          child: Form(
            key: c.formKey,
            child: PageView(
              controller: _pageCtrl,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                GeneralSection( c: c, isMobile: isMobile),
                DetailsSection( c: c, isMobile: isMobile),
                ContactsSection(c: c, isMobile: isMobile),
                LocationSection(c: c, isMobile: isMobile),
                ActionSection(
                  c:               c,
                  projectId:       _projectId,
                  onRefreshColors: _refreshCardColors,
                ),
              ],
            ),
          ),
        ),
        _WizardNavBar(
          currentStep:  _currentStep,
          totalSteps:   _kSteps.length,
          onBack:       _goBack,
          onNext:       _goNext,
          onSubmit:     () => _submit(goBackAfterSave: false),
          onSubmitBack: () => _submit(goBackAfterSave: true),
          projectId:    _projectId,
          isSubmitting: _submitting,
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WIZARD HEADER — step indicators
// ══════════════════════════════════════════════════════════════════════════════

class _WizardHeader extends StatelessWidget {
  final List<_WizardStep> steps;
  final int currentStep;
  final String? projectId;

  const _WizardHeader({
    required this.steps,
    required this.currentStep,
    required this.projectId,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kCrmSurface,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
          child: Row(children: [
            InkWell(
              onTap: () => context.canPop()
                  ? context.pop()
                  : context.go(MyRoute.userGridScreen),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  border: Border.all(color: kCrmBorder),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.arrow_back_rounded,
                    size: 16, color: kCrmTextSub),
              ),
            ),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                AppLocalizations.of(context).translate(projectId == null ? 'New Project' : 'Edit Project'),
                style: tInter(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: kCrmText),
              ),
              Text(
                '${AppLocalizations.of(context).translate('Step')} ${currentStep + 1} '
                '${AppLocalizations.of(context).translate('of')} ${steps.length} — '
                '${AppLocalizations.of(context).translate(steps[currentStep].title)}',
                style: tInter(fontSize: 12, color: kCrmTextSub),
              ),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 72,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: steps.length,
            itemBuilder: (_, i) {
              final step    = steps[i];
              final done    = i < currentStep;
              final current = i == currentStep;
              final color   = current
                  ? kCrmPrimary
                  : done
                      ? kCrmSuccess
                      : kCrmBorder;

              return Row(mainAxisSize: MainAxisSize.min, children: [
                SizedBox(
                  width: 110,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: current
                              ? kCrmPrimary
                              : done
                                  ? kCrmSuccess
                                  : kCrmBorder.withOpacity(0.5),
                          shape: BoxShape.circle,
                          boxShadow: (current || done)
                              ? [
                                  BoxShadow(
                                      color: color.withOpacity(0.3),
                                      blurRadius: 8)
                                ]
                              : null,
                        ),
                        child: Icon(
                          done ? Icons.check_rounded : step.icon,
                          size: 16,
                          color: (current || done)
                              ? Colors.white
                              : kCrmTextSub,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        AppLocalizations.of(context).translate(step.title),
                        style: tInter(
                          fontSize: 10,
                          fontWeight: current
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: current
                              ? kCrmPrimary
                              : done
                                  ? kCrmSuccess
                                  : kCrmTextSub,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                if (i < steps.length - 1)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 18),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      width: 20,
                      height: 2,
                      color: i < currentStep ? kCrmSuccess : kCrmBorder,
                    ),
                  ),
              ]);
            },
          ),
        ),
        Container(height: 1, color: kCrmBorder),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WIZARD NAV BAR — prev / next / submit
// ══════════════════════════════════════════════════════════════════════════════

class _WizardNavBar extends StatelessWidget {
  final int currentStep;
  final int totalSteps;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final VoidCallback onSubmit;
  final VoidCallback onSubmitBack;
  final String? projectId;
  final bool isSubmitting;

  const _WizardNavBar({
    required this.currentStep,
    required this.totalSteps,
    required this.onBack,
    required this.onNext,
    required this.onSubmit,
    required this.onSubmitBack,
    required this.projectId,
    required this.isSubmitting,
  });

  bool get _isLast => currentStep == totalSteps - 1;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: BoxDecoration(
        color: kCrmSurface,
        border: const Border(top: BorderSide(color: kCrmBorder)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, -3))
        ],
      ),
      child: Row(children: [
        Text(
          '${currentStep + 1} / $totalSteps',
          style: tInter(fontSize: 12, color: kCrmTextSub),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (currentStep + 1) / totalSteps,
              backgroundColor: kCrmBorder,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(kCrmPrimary),
              minHeight: 4,
            ),
          ),
        ),
        const SizedBox(width: 16),
        if (currentStep > 0) ...[
          OutlinedButton.icon(
            onPressed: isSubmitting ? null : onBack,
            icon: const Icon(Icons.arrow_back_rounded, size: 14),
            label: Text('Back', style: tInter(fontSize: 13)),
            style: OutlinedButton.styleFrom(
                foregroundColor: kCrmTextSub,
                side: const BorderSide(color: kCrmBorder),
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10)),
          ),
          const SizedBox(width: 10),
        ],
        if (!_isLast)
          GradientButton(
              label: 'Next',
              icon: Icons.arrow_forward_rounded,
              onTap: isSubmitting ? () {} : onNext)
        else ...[
          if (isSubmitting)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            )
          else ...[
            GradientButton(
                label: projectId == null ? 'Create' : 'Update',
                icon: Icons.check_rounded,
                onTap: onSubmit),
            if (projectId != null) ...[
              const SizedBox(width: 10),
              GradientButton(
                  label: 'Update & Back',
                  icon: Icons.check_circle_outline_rounded,
                  onTap: onSubmitBack,
                  secondary: true),
            ],
          ],
        ],
      ]),
    );
  }
}
