// lib/forms/view/sections/contacts_section.dart
//
// Step 3 — Company, Engineer, Architect contacts (project type only).
//
// GetX rules:
//   • CrmDropdown<String> accepts Rx<String?> — the common base of both
//     Rxn<String> and Rxn<String?> regardless of how GetX 4.7.x resolves the
//     RxnString typedef.  No casting, no workarounds needed.
//   • buildItems is called inside CrmDropdown's internal Obx, so it
//     subscribes to c.companies / c.engineers / c.architects (RxList) and
//     rebuilds automatically when the API response arrives.
//   • The conditional "Other" text field uses its own Obx reading the same
//     RxnString — valid single-observable subscription.
//   • No setState() anywhere.

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'package:dash_master_toolkit/forms/controller/project_form_controller.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/view/widgets/crm_widgets.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class ContactsSection extends StatelessWidget {
  final ProjectFormController c;
  final bool isMobile;

  const ContactsSection({super.key, required this.c, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Only meaningful for project type — parent already shows this step
        // regardless; we guard per-block instead for a smoother UX.
        Obx(() => c.isProject
            ? _ContactsBody(c: c, isMobile: isMobile)
            : Center(
                child: Padding(
                  padding: const EdgeInsets.only(top: 48),
                  child: Text(
                    AppLocalizations.of(context)
                        .translate('Contacts are only required for the Project type.'),
                    textAlign: TextAlign.center,
                    style: tInter(fontSize: 14, color: kCrmTextSub),
                  ),
                ),
              )),
      ]),
    );
  }
}

// ── Full contacts body ────────────────────────────────────────────────────────

class _ContactsBody extends StatelessWidget {
  final ProjectFormController c;
  final bool isMobile;

  const _ContactsBody({required this.c, required this.isMobile});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // ── Company ──────────────────────────────────────────────────────────
      const CrmSectionTitle(title: 'Company', icon: Icons.business_rounded),
      const SizedBox(height: 12),
      CrmDropdown<String>(
        label: 'Company',
        hint: 'Select company',
        rxValue: c.selectedCompanyId,
        buildItems: () => [
          DropdownMenuItem(value: null, child: Text(AppLocalizations.of(context).translate('None'))),
          ...c.companies.map((co) =>
              DropdownMenuItem(value: co.id, child: Text(co.name))),
          DropdownMenuItem(value: 'other', child: Text(AppLocalizations.of(context).translate('Other'))),
        ],
        onChanged: c.setSelectedCompany,
      ),
      Obx(() => c.selectedCompanyId.value == 'other'
          ? Padding(
              padding: const EdgeInsets.only(top: 10),
              child: CrmTextField(
                  label: 'Company name', controller: c.entreprise),
            )
          : const SizedBox.shrink()),

      const SizedBox(height: 20),

      // ── Engineer ──────────────────────────────────────────────────────────
      const CrmSectionTitle(
          title: 'Engineer', icon: Icons.engineering_rounded),
      const SizedBox(height: 12),
      CrmDropdown<String>(
        label: 'Engineer',
        hint: 'Select engineer',
        rxValue: c.selectedEngineerId,
        buildItems: () => [
          DropdownMenuItem(value: null, child: Text(AppLocalizations.of(context).translate('None'))),
          ...c.engineers.map((e) =>
              DropdownMenuItem(value: e.id, child: Text(e.name))),
          DropdownMenuItem(value: 'other', child: Text(AppLocalizations.of(context).translate('Other'))),
        ],
        onChanged: c.setSelectedEngineer,
      ),
      Obx(() => c.selectedEngineerId.value == 'other'
          ? Padding(
              padding: const EdgeInsets.only(top: 10),
              child: CrmTextField(
                  label: 'Engineer name',
                  controller: c.ingenieurResponsable),
            )
          : const SizedBox.shrink()),

      const SizedBox(height: 8),
      crmTwoCols(
        isMobile: isMobile,
        left: CrmTextField(
            label: 'Engineer Phone',
            controller: c.telephoneIngenieur,
            keyboardType: TextInputType.phone),
        right: CrmTextField(
            label: 'Engineer Email',
            controller: c.emailIngenieur,
            keyboardType: TextInputType.emailAddress),
      ),

      const SizedBox(height: 20),

      // ── Architect ─────────────────────────────────────────────────────────
      const CrmSectionTitle(
          title: 'Architect', icon: Icons.architecture_rounded),
      const SizedBox(height: 12),
      CrmDropdown<String>(
        label: 'Architect',
        hint: 'Select architect',
        rxValue: c.selectedArchitectId,
        buildItems: () => [
          DropdownMenuItem(value: null, child: Text(AppLocalizations.of(context).translate('None'))),
          ...c.architects.map((a) =>
              DropdownMenuItem(value: a.id, child: Text(a.name))),
          DropdownMenuItem(value: 'other', child: Text(AppLocalizations.of(context).translate('Other'))),
        ],
        onChanged: c.setSelectedArchitect,
      ),
      Obx(() => c.selectedArchitectId.value == 'other'
          ? Padding(
              padding: const EdgeInsets.only(top: 10),
              child: CrmTextField(
                  label: 'Architect name', controller: c.architecte),
            )
          : const SizedBox.shrink()),

      const SizedBox(height: 8),
      crmTwoCols(
        isMobile: isMobile,
        left: CrmTextField(
            label: 'Architect Phone',
            controller: c.telephoneArchitecte,
            keyboardType: TextInputType.phone),
        right: CrmTextField(
            label: 'Architect Email',
            controller: c.emailArchitecte,
            keyboardType: TextInputType.emailAddress),
      ),
    ]);
  }
}

