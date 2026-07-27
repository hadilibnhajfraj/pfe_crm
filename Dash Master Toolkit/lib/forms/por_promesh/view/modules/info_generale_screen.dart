// lib/forms/por_promesh/view/modules/info_generale_screen.dart
//
// Étape 3 du parcours opérateur PROMESH (Machine → Poste → Informations
// générales → Modules). Date de production, heure début, heure fin et
// opérateur ne sont plus jamais générés automatiquement : l'utilisateur les
// saisit ici avant d'accéder aux modules métiers.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';

import '../../controller/por_promesh_controller.dart';
import 'industrial_context_header.dart';

class InfoGeneraleScreen extends StatefulWidget {
  final String machine;
  final String poste;

  const InfoGeneraleScreen({super.key, required this.machine, required this.poste});

  @override
  State<InfoGeneraleScreen> createState() => _InfoGeneraleScreenState();
}

class _InfoGeneraleScreenState extends State<InfoGeneraleScreen> {
  late final PorPromeshController c;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // permanent: true — voir le commentaire dans rendement_screen.dart :
    // ce controller est partagé entre tous les écrans-module de la session
    // machine/poste et ne doit jamais être détruit par le dispose() d'un
    // écran particulier (course initState/dispose entre écrans successifs).
    c = Get.isRegistered<PorPromeshController>()
        ? Get.find<PorPromeshController>()
        : Get.put(PorPromeshController(), permanent: true);
    _bootstrap();
  }

  // Le formulaire (et ses TextEditingController, déjà créés sur le
  // contrôleur permanent) s'affiche immédiatement — aucun écran blanc à
  // attendre. `bootstrapForMachinePoste` (mis en cache pour machine+poste+
  // date) remplit les champs une fois résolu ; les `TextEditingController`
  // notifient alors les champs déjà visibles, sans reconstruction de page.
  Future<void> _bootstrap() async {
    await c.bootstrapForMachinePoste(widget.machine, widget.poste);
    if (!mounted) return;
    if (c.isLocked.value || c.status.value == 'submitted') {
      context.go(_fichePath);
    }
  }

  String get _fichePath =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/dashboard';

  String get _backRoute => '${MyRoute.productionPromeshRoot}/machine/${widget.machine}';
  String get _modulesRoute =>
      '${MyRoute.productionPromeshRoot}/machine/${widget.machine}/poste/${widget.poste}/modules';

  Future<void> _continue() async {
    if (!(c.formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (!mounted) return;
      context.go(_modulesRoute);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e'), backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: IndustrialPageBody(
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      InkWell(
                        onTap: () => context.go(_backRoute),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.all(7),
                          decoration:
                              BoxDecoration(border: Border.all(color: kCrmBorder), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.arrow_back_rounded, size: 16, color: kCrmTextSub),
                        ),
                      ),
                      const SizedBox(height: 16),
                      IndustrialContextHeader(machine: widget.machine, poste: widget.poste, color: kPromeshColor),
                    ]),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                        key: c.formKey,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Informations générales',
                              style: tInter(fontSize: 20, fontWeight: FontWeight.w900, color: kCrmText)),
                          const SizedBox(height: 4),
                          Text('Saisissez la date et les horaires de ce poste de production.',
                              style: tInter(fontSize: 13, color: kCrmTextSub)),
                          const SizedBox(height: 20),
                          CrmDateField(
                            label: 'Date Production',
                            controller: c.dateProduction,
                            required: true,
                            onTap: () => c.pickDateProduction(context),
                          ),
                          crmTwoCols(
                            isMobile: MediaQuery.of(context).size.width < 600,
                            left: _TimeField(
                              label: 'Heure Début',
                              controller: c.heureDebut,
                              onTap: () => c.pickHeureDebut(context),
                            ),
                            right: _TimeField(
                              label: 'Heure Fin',
                              controller: c.heureFin,
                              onTap: () => c.pickHeureFin(context),
                            ),
                          ),
                          CrmTextField(
                            label: 'Opérateur connecté',
                            controller: c.operateur,
                            validator: (v) => c.requiredValidator(v, 'Opérateur'),
                          ),
                        ]),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                    child: IndustrialBigButton(
                      label: _saving ? 'Enregistrement…' : 'Continuer',
                      icon: Icons.arrow_forward_rounded,
                      color: kPromeshColor,
                      onTap: _saving ? null : _continue,
                    ),
                  ),
                ]),
              ),
      ),
    );
  }
}

class _TimeField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final VoidCallback onTap;

  const _TimeField({required this.label, required this.controller, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FieldLabel(text: label, required: true),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          readOnly: true,
          onTap: onTap,
          validator: (v) => (v == null || v.trim().isEmpty) ? '$label est obligatoire' : null,
          decoration: inputDecoration(context, hintText: 'Sélectionner une heure').copyWith(
            suffixIcon: IconButton(
              icon: const Icon(Icons.access_time_rounded, size: 18, color: kCrmTextSub),
              onPressed: onTap,
            ),
          ),
        ),
      ]),
    );
  }
}
