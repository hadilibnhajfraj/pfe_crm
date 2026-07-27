// lib/forms/view/widgets/crm_widgets.dart
//
// Shared CRM UI primitives.
// All widgets are StatelessWidget — no setState, no Obx here.
//
// Typing note for CrmDropdown<T>:
//   In GetX 4.7.x, Rxn<T> extends Rx<T?>.  Whether the typedef resolves as
//   Rxn<String> or Rxn<String?>, both are subtypes of Rx<String?> (because
//   Rxn<String> extends Rx<String?> and Rxn<String?> extends Rx<String?>).
//   Accepting Rx<T?> as the parameter therefore works with every flavour of
//   RxnString without any casting.

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/widgets/common_app_widget.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

// ── Field label ───────────────────────────────────────────────────────────────

class FieldLabel extends StatelessWidget {
  final String text;
  final bool required;

  const FieldLabel({super.key, required this.text, this.required = false});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmText),
        children: [
          TextSpan(text: AppLocalizations.of(context).translate(text)),
          if (required)
            const TextSpan(
              text: ' *',
              style: TextStyle(fontWeight: FontWeight.w900, color: kCrmDanger),
            ),
        ],
      ),
    );
  }
}

// ── Text field ────────────────────────────────────────────────────────────────

class CrmTextField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final int maxLines;
  final bool readOnly;
  final VoidCallback? onTap;
  final Widget? suffixWidget;
  final void Function(String)? onChanged;

  const CrmTextField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.keyboardType,
    this.maxLines = 1,
    this.readOnly = false,
    this.onTap,
    this.suffixWidget,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FieldLabel(text: label, required: validator != null),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          validator: validator,
          keyboardType: keyboardType,
          maxLines: maxLines,
          readOnly: readOnly,
          onTap: onTap,
          onChanged: onChanged,
          decoration: inputDecoration(context,
              hintText: AppLocalizations.of(context).translate(label), suffixWidget: suffixWidget),
        ),
      ]),
    );
  }
}

// ── Date field ────────────────────────────────────────────────────────────────

class CrmDateField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final VoidCallback onTap;
  final bool required;

  const CrmDateField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    required this.onTap,
    this.required = false,
  });

  @override
  Widget build(BuildContext context) {
    final isReq = required || validator != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FieldLabel(text: label, required: isReq),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          validator: validator ??
              (isReq
                  ? (v) => (v == null || v.trim().isEmpty)
                      ? '${AppLocalizations.of(context).translate(label)} ${AppLocalizations.of(context).translate('is required')}'
                      : null
                  : null),
          readOnly: true,
          onTap: onTap,
          decoration: inputDecoration(context,
                  hintText: AppLocalizations.of(context).translate('Select date'))
              .copyWith(
            suffixIcon: IconButton(
              icon: const Icon(Icons.calendar_month_outlined,
                  size: 18, color: kCrmTextSub),
              onPressed: onTap,
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Section title ─────────────────────────────────────────────────────────────

class CrmSectionTitle extends StatelessWidget {
  final String title;
  final IconData icon;

  const CrmSectionTitle({super.key, required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        padding: const EdgeInsets.all(7),
        decoration: BoxDecoration(
          color: kCrmPrimary.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, size: 14, color: kCrmPrimary),
      ),
      const SizedBox(width: 10),
      Text(AppLocalizations.of(context).translate(title),
          style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmText)),
    ]);
  }
}

// ── Status banner ─────────────────────────────────────────────────────────────

class CrmStatusBanner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String text;
  final Widget? trailing;

  const CrmStatusBanner({
    super.key,
    required this.color,
    required this.icon,
    required this.text,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(AppLocalizations.of(context).translate(text),
                style: TextStyle(
                    color: color, fontSize: 12, fontWeight: FontWeight.w500)),
          ),
        ]),
        if (trailing != null) ...[const SizedBox(height: 4), trailing!],
      ]),
    );
  }
}

// ── Gradient button ───────────────────────────────────────────────────────────

class GradientButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool secondary;

  const GradientButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.secondary = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 15),
        decoration: BoxDecoration(
          gradient: secondary
              ? LinearGradient(colors: [
                  kCrmTextSub.withOpacity(0.15),
                  kCrmTextSub.withOpacity(0.08),
                ])
              : const LinearGradient(
                  colors: [kCrmPrimary, kCrmSecondary],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
          borderRadius: BorderRadius.circular(12),
          boxShadow: secondary
              ? null
              : [
                  BoxShadow(
                      color: kCrmPrimary.withOpacity(0.3),
                      blurRadius: 8,
                      offset: const Offset(0, 3))
                ],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon,
              color: secondary ? kCrmTextSub : Colors.white, size: 18),
          const SizedBox(width: 8),
          Text(AppLocalizations.of(context).translate(label),
              style: tInter(
                  color: secondary ? kCrmTextSub : Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15)),
        ]),
      ),
    );
  }
}

// ── Two-column layout helper ──────────────────────────────────────────────────

Widget crmTwoCols({
  required bool isMobile,
  required Widget left,
  required Widget right,
}) {
  if (isMobile) return Column(children: [left, right]);
  return Row(children: [
    Expanded(child: left),
    const SizedBox(width: 12),
    Expanded(child: right),
  ]);
}

// ── Three-column layout helper ────────────────────────────────────────────────

Widget crmThreeCols({
  required bool isMobile,
  required Widget first,
  required Widget second,
  required Widget third,
}) {
  if (isMobile) return Column(children: [first, second, third]);
  return Row(children: [
    Expanded(child: first),
    const SizedBox(width: 12),
    Expanded(child: second),
    const SizedBox(width: 12),
    Expanded(child: third),
  ]);
}

// ── Reactive Rx<T?>-based dropdown (GetX) ────────────────────────────────────
//
// CrmDropdown<T> — the generic, production-ready contact/select dropdown.
//
// WHY Rx<T?> instead of Rxn<T>:
//   • Rxn<T> extends Rx<T?> in GetX 4.x.
//   • Dart generics are invariant, so Rxn<String?> ≠ Rxn<String>.
//   • Accepting Rx<T?> is the common base that covers ALL variants:
//       – RxnString (= Rxn<String>  = Rx<String?>)
//       – Rxn<String?> (= Rx<String?>)
//       – Rxn<int>    (= Rx<int?>)  via CrmDropdown<int>
//   • Obx reads rxValue.value (T?) directly → valid GetX subscription.
//
// buildItems is called INSIDE Obx, so it also subscribes to any RxList the
// lambda captures (e.g. c.companies). The dropdown auto-updates when the
// list loads from the API — no extra GetBuilder needed.

class CrmDropdown<T> extends StatelessWidget {
  final String label;
  final bool isRequired;
  final Rx<T?> rxValue; // accepts Rxn<T>, Rxn<T?>, any Rx<T?>
  final List<DropdownMenuItem<T?>> Function() buildItems;
  final void Function(T?) onChanged;
  final String hint;
  final String? Function(T?)? validator;

  const CrmDropdown({
    super.key,
    required this.label,
    this.isRequired = false,
    required this.rxValue,
    required this.buildItems,
    required this.onChanged,
    required this.hint,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FieldLabel(text: label, required: isRequired || validator != null),
        const SizedBox(height: 6),
        // Obx reads rxValue.value AND any RxList captured by buildItems → valid.
        Obx(() => DropdownButtonFormField<T?>(
              value: rxValue.value,
              validator: validator,
              decoration: inputDecoration(context,
                  hintText: AppLocalizations.of(context).translate(hint)),
              hint: Text(AppLocalizations.of(context).translate(hint),
                  style: tInter(fontSize: 13, color: kCrmTextSub)),
              items: buildItems(),
              onChanged: onChanged,
            )),
      ]),
    );
  }
}

// ── TextEditingController-based dropdown ──────────────────────────────────────
// Uses ValueListenableBuilder so NO setState() is needed — the dropdown
// rebuilds automatically when the underlying TextEditingController changes.

class CrmStringDropdown extends StatelessWidget {
  final String label;
  final bool required;
  final TextEditingController controller;
  final List<Map<String, String>> options; // [{value:..., label:...}]
  final String hint;
  final String? defaultValue;
  final String? Function(String?)? validator;

  const CrmStringDropdown({
    super.key,
    required this.label,
    this.required = false,
    required this.controller,
    required this.options,
    required this.hint,
    this.defaultValue,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16, top: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FieldLabel(text: label, required: required || validator != null),
        const SizedBox(height: 6),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (_, val, __) {
            final txt = val.text.trim();
            final valid = options.any((o) => o['value'] == txt);
            final current = valid ? txt : (options.isNotEmpty ? options.first['value']! : '');
            return DropdownButtonFormField<String>(
              value: current.isEmpty ? null : current,
              validator: validator,
              decoration: inputDecoration(context,
                  hintText: AppLocalizations.of(context).translate(hint)),
              items: options
                  .map((o) => DropdownMenuItem(
                      value: o['value']!,
                      child: Text(AppLocalizations.of(context).translate(o['label']!))))
                  .toList(),
              onChanged: (v) =>
                  controller.text = v ?? (defaultValue ?? ''),
            );
          },
        ),
      ]),
    );
  }
}
