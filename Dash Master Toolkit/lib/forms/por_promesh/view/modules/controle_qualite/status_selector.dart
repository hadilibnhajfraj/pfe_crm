// lib/forms/por_promesh/view/modules/controle_qualite/status_selector.dart
//
// Rangée de boutons à choix unique (Conforme/Non Conforme, OK/NOK,
// Oui/Non, Vide/Moyen/Plein...) — gros boutons tactiles, hover animé,
// couleur affirmée à la sélection. Remplace les anciens
// `_OptionButton`/`_OptionsRow` de `controle_qualite_screen.dart`, généralisés
// pour être réutilisés par [ParameterCard] et la grille "Contrôle Machine".
//
// Largeur calculée via `LayoutBuilder` : les boutons se partagent
// équitablement TOUTE la largeur disponible tant qu'ils tiennent sur une
// ligne (au-dessus d'une largeur minimale lisible, `_kMinButtonWidth`) ; en
// dessous (carte étroite, mobile, 3 options ou plus), `Wrap` les fait
// automatiquement passer à la ligne suivante au lieu de provoquer un
// RenderFlex overflow horizontal.

import 'package:flutter/material.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class StatusOption {
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  const StatusOption({required this.value, required this.label, required this.icon, required this.color});
}

class StatusSelector extends StatelessWidget {
  final List<StatusOption> options;
  final String? selected;
  final ValueChanged<String> onSelect;

  const StatusSelector({super.key, required this.options, required this.selected, required this.onSelect});

  static const double _kSpacing = 6;
  static const double _kMinButtonWidth = 88;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(builder: (context, constraints) {
      final hasBoundedWidth = constraints.maxWidth.isFinite;
      final maxWidth = hasBoundedWidth ? constraints.maxWidth : 320.0;
      final n = options.length;
      final evenWidth = (maxWidth - _kSpacing * (n - 1)) / n;
      final buttonWidth = evenWidth >= _kMinButtonWidth ? evenWidth : _kMinButtonWidth;

      return Wrap(
        spacing: _kSpacing,
        runSpacing: _kSpacing,
        children: [
          for (final option in options)
            SizedBox(
              width: buttonWidth,
              child: _StatusButton(
                option: option,
                selected: selected == option.value,
                onTap: () => onSelect(option.value),
              ),
            ),
        ],
      );
    });
  }
}

class _StatusButton extends StatefulWidget {
  final StatusOption option;
  final bool selected;
  final VoidCallback onTap;

  const _StatusButton({required this.option, required this.selected, required this.onTap});

  @override
  State<_StatusButton> createState() => _StatusButtonState();
}

class _StatusButtonState extends State<_StatusButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final option = widget.option;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: AnimatedScale(
        scale: _hover ? 1.03 : 1.0,
        duration: const Duration(milliseconds: 150),
        child: InkWell(
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            constraints: const BoxConstraints(minHeight: 34),
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 6),
            decoration: BoxDecoration(
              color: widget.selected ? option.color.withOpacity(0.12) : kCrmBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: widget.selected ? option.color : (_hover ? option.color.withOpacity(0.5) : kCrmBorder),
                width: widget.selected ? 1.6 : 1,
              ),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(option.icon, size: 13, color: widget.selected ? option.color : kCrmTextSub),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  AppLocalizations.of(context).translate(option.label),
                  maxLines: 1,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: widget.selected ? option.color : kCrmText),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
