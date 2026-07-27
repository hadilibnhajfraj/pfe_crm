// lib/forms/view/sections/general_section.dart
//
// Step 1 — Project type, basic info, status.
//
// GetX rules applied:
//   • Obx() used ONLY where .obs value is read directly inside the builder.
//   • The type-chip Row is NOT wrapped by Obx — each _TypeChip manages its own.
//   • ValueListenableBuilder handles TextEditingController-based dropdowns.
//   • No setState() anywhere in this file.

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/controller/project_form_controller.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';

// ── Step 1 root ───────────────────────────────────────────────────────────────

class GeneralSection extends StatelessWidget {
  final ProjectFormController c;
  final bool isMobile;

  const GeneralSection({super.key, required this.c, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // ── Project type ──────────────────────────────────────────────────
        const CrmSectionTitle(
            title: 'Project Type', icon: Icons.category_rounded),
        const SizedBox(height: 12),
        // Row is NOT wrapped in Obx — each chip has its own Obx internally.
        Row(children: [
          _TypeChip(c: c, label: 'Project',     value: 'project',
              icon: Icons.construction_rounded,  color: kCrmPrimary),
          const SizedBox(width: 10),
          _TypeChip(c: c, label: 'Revendeur',   value: 'revendeur',
              icon: Icons.store_rounded,         color: kCrmWarning),
          const SizedBox(width: 10),
          _TypeChip(c: c, label: 'Applicateur', value: 'applicateur',
              icon: Icons.engineering_rounded,   color: kCrmInfo),
        ]),

        const SizedBox(height: 24),

        // ── Basic info ────────────────────────────────────────────────────
        const CrmSectionTitle(
            title: 'Basic Information', icon: Icons.info_outline_rounded),
        const SizedBox(height: 12),
        crmTwoCols(
          isMobile: isMobile,
          // Label changes depending on project type — Obx reads .obs correctly.
          left: Obx(() => CrmTextField(
                label: c.projectModele.value == 'revendeur'
                    ? 'Société / Person Name'
                    : 'Project Name',
                controller: c.nomProjet,
                validator: (v) => c.requiredValidator(v, 'Project Name'),
              )),
          // Date field rebuilds via GetBuilder with id, not Obx.
          right: GetBuilder<ProjectFormController>(
            id: 'dateDemarrage',
            builder: (_) => CrmDateField(
              label: 'Start Date',
              controller: c.dateDemarrage,
              validator: (v) => c.requiredValidator(v, 'Start Date'),
              onTap: () => c.pickDateDemarrage(context),
            ),
          ),
        ),
        CrmDateField(
          label: 'Visit Date',
          controller: c.dateVisite,
          required: true,
          onTap: () => c.pickDateVisite(context),
        ),

        // ── Status (project type only) ────────────────────────────────────
        // Obx reads c.isProject which accesses c.projectModele.value → correct.
        Obx(() => c.isProject
            ? _ProjectStatusSection(c: c, isMobile: isMobile)
            : const SizedBox.shrink()),

        const SizedBox(height: 8),
        CrmTextField(
          label: 'Market Amount',
          controller: c.montantMarche,
          keyboardType: TextInputType.number,
        ),
      ]),
    );
  }
}

// ── Type chip ─────────────────────────────────────────────────────────────────
// Each chip is its own widget with its own Obx — clean, granular rebuild.

class _TypeChip extends StatelessWidget {
  final ProjectFormController c;
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _TypeChip({
    required this.c,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    // This Obx directly reads c.projectModele.value → valid usage.
    return Obx(() {
      final selected = c.projectModele.value == value;
      return GestureDetector(
        onTap: () => c.onProjectModeleChanged(value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.1) : kCrmSurface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: selected ? color : kCrmBorder,
                width: selected ? 1.5 : 1.0),
            boxShadow: selected
                ? [
                    BoxShadow(
                        color: color.withOpacity(0.15),
                        blurRadius: 8,
                        offset: const Offset(0, 3))
                  ]
                : null,
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon,
                size: 15, color: selected ? color : kCrmTextSub),
            const SizedBox(width: 6),
            Text(label,
                style: tInter(
                    fontSize: 13,
                    fontWeight:
                        selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected ? color : kCrmTextSub)),
          ]),
        ),
      );
    });
  }
}

// ── Project-only status/validation section ────────────────────────────────────

class _ProjectStatusSection extends StatelessWidget {
  final ProjectFormController c;
  final bool isMobile;

  static const _statusOptions = [
    {'label': 'Identification',      'value': 'Identification'},
    {'label': 'Technical Proposal',  'value': 'Proposition technique'},
    {'label': 'Commercial Proposal', 'value': 'Proposition commerciale'},
    {'label': 'Negotiation',         'value': 'Négociation'},
    {'label': 'Delivery',            'value': 'Livraison'},
    {'label': 'Loyalty',             'value': 'Fidélisation'},
  ];

  static const _validationOptions = [
    {'label': 'Validated',     'value': 'Validé'},
    {'label': 'Not validated', 'value': 'Non validé'},
  ];

  const _ProjectStatusSection({required this.c, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 8),
      const CrmSectionTitle(title: 'Status', icon: Icons.flag_outlined),
      const SizedBox(height: 12),
      CrmStringDropdown(
        label: 'Project Status',
        required: true,
        controller: c.statut,
        options: _statusOptions,
        hint: 'Choose a status',
        validator: (v) =>
            (v == null || v.isEmpty) ? 'Status is required' : null,
      ),
      crmTwoCols(
        isMobile: isMobile,
        left: CrmStringDropdown(
          label: 'Validation Status',
          controller: c.validationStatut,
          options: _validationOptions,
          hint: 'Choose',
          defaultValue: 'Non validé',
        ),
        right: CrmTextField(
          label: 'Success Rate (0–100)',
          controller: c.pourcentageReussite,
          validator: c.percentValidator,
          keyboardType:
              const TextInputType.numberWithOptions(decimal: true),
        ),
      ),
    ]);
  }
}
