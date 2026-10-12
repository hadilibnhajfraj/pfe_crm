// lib/forms/production/view/widgets/production_widgets.dart
//
// Briques visuelles du module Production (dashboard, listes PROMESH / PROBAR,
// fiche) : cartes à bordure fine, tuiles KPI compactes, badges de statut,
// filtre période, tableau scrollable horizontalement. Mêmes jetons que le
// reste de l'espace industriel (pipeline_theme.dart / industrial_theme.dart).

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/forms/recuperables/theme/recuperable_theme.dart';

import '../../model/production_models.dart';

// ── Couleurs fonctionnelles ────────────────────────────────────────────────
const Color kProdWasteColor = kMaintenanceColor; // rouge — déchets / alertes
const Color kProdRecuperableColor = kRecuperableColor; // vert — récupérables
const Color kProdNeutral = Color(0xFF475569);
const Color kProdHeaderBg = Color(0xFFF8FAFC);
const double kProdMaxWidth = 1320;
const double kProdRadius = 14;

Color prodLineColor(String line) => line == 'probar' ? kProbarColor : kPromeshColor;

// ── Formats ────────────────────────────────────────────────────────────────
final NumberFormat _intFmt = NumberFormat('#,##0', 'fr_FR');
final NumberFormat _decFmt = NumberFormat('#,##0.##', 'fr_FR');

String prodInt(num v) => _intFmt.format(v);
String prodNum(num v) => _decFmt.format(v);

/// Taux de déchets : kg de déchets pour 100 m² produits ; « — » si rien n'a
/// été produit sur la période.
String prodRate(double? rate) => rate == null ? '—' : _decFmt.format(rate);

/// `yyyy-MM-dd` → `dd/MM/yyyy` ; `yyyy-MM` → `MM/yyyy`.
String prodDate(String? value) {
  if (value == null || value.isEmpty) return '—';
  final p = value.split('-');
  if (p.length == 2) return '${p[1]}/${p[0]}';
  if (p.length >= 3) return '${p[2].substring(0, 2)}/${p[1]}/${p[0]}';
  return value;
}

String prodDateTime(String? iso) {
  final d = DateTime.tryParse(iso ?? '');
  if (d == null) return '—';
  return DateFormat('dd/MM/yyyy HH:mm').format(d.toLocal());
}

String prodPoste(String? poste) {
  switch (poste) {
    case 'matin':
      return 'Matin';
    case 'nuit':
      return 'Nuit';
    default:
      return '—';
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

/// Corps de page : fond clair, contenu centré et borné, tirer pour actualiser.
class ProdPage extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final List<Widget> children;

  const ProdPage({super.key, required this.onRefresh, required this.children});

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.of(context).size.width < 640;
    return Scaffold(
      backgroundColor: kCrmBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: onRefresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.all(narrow ? 14 : 24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: kProdMaxWidth),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ProdPageHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final List<Widget> actions;
  final VoidCallback? onBack;

  const ProdPageHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.color = kProdNeutral,
    this.actions = const [],
    this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final heading = Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      if (onBack != null)
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: IconButton(
            tooltip: 'Retour',
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back_rounded, size: 20, color: kCrmTextSub),
          ),
        ),
      Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(color: color.withOpacity(0.10), borderRadius: BorderRadius.circular(11)),
        child: Icon(icon, size: 22, color: color),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: tInter(fontSize: 22, fontWeight: FontWeight.w800, color: kCrmText, letterSpacing: -0.2)),
          const SizedBox(height: 3),
          Text(subtitle, style: tInter(fontSize: 13, color: kCrmTextSub, height: 1.35)),
        ]),
      ),
    ]);

    return LayoutBuilder(builder: (context, c) {
      if (actions.isEmpty) return heading;
      if (c.maxWidth < 760) {
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          heading,
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: actions),
        ]);
      }
      return Row(children: [
        Expanded(child: heading),
        const SizedBox(width: 16),
        Wrap(spacing: 8, runSpacing: 8, children: actions),
      ]);
    });
  }
}

/// Carte : surface blanche, bordure fine, ombre très légère.
class ProdCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? accent; // liseré supérieur (couleur de ligne)

  const ProdCard({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(kProdRadius),
        border: Border.all(color: kCrmBorder),
        boxShadow: const [BoxShadow(color: Color(0x0A0F172A), blurRadius: 10, offset: Offset(0, 2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        if (accent != null) Container(height: 3, color: accent),
        Padding(padding: padding, child: child),
      ]),
    );
  }
}

class ProdSectionTitle extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const ProdSectionTitle({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: tInter(fontSize: 15.5, fontWeight: FontWeight.w800, color: kCrmText)),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: tInter(fontSize: 12, color: kCrmTextSub)),
          ],
        ]),
      ),
      if (trailing != null) trailing!,
    ]);
  }
}

// ── KPI ────────────────────────────────────────────────────────────────────

/// Tuile KPI compacte : libellé, valeur + unité, contexte. La valeur reste en
/// encre neutre ; seule l'icône porte la couleur fonctionnelle.
class ProdKpiTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String? unit;
  final String? caption;
  final Color color;
  final bool loading;

  const ProdKpiTile({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.unit,
    this.caption,
    this.color = kProdNeutral,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return ProdCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: kCrmTextSub, letterSpacing: 0.5)),
            const SizedBox(height: 8),
            if (loading)
              const ProdSkeleton(width: 90, height: 24)
            else
              Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                Flexible(
                  child: Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tInter(fontSize: 23, fontWeight: FontWeight.w800, color: kCrmText, letterSpacing: -0.4)),
                ),
                if (unit != null) ...[
                  const SizedBox(width: 5),
                  Text(unit!, style: tInter(fontSize: 12, fontWeight: FontWeight.w600, color: kCrmTextSub)),
                ],
              ]),
            if (caption != null) ...[
              const SizedBox(height: 5),
              Text(caption!, maxLines: 1, overflow: TextOverflow.ellipsis, style: tInter(fontSize: 11.5, color: kCrmTextSub)),
            ],
          ]),
        ),
        const SizedBox(width: 10),
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: color.withOpacity(0.10), borderRadius: BorderRadius.circular(9)),
          child: Icon(icon, size: 18, color: color),
        ),
      ]),
    );
  }
}

/// Grille responsive : 4 colonnes (desktop), 2 (tablette), 1 (mobile) — les
/// tuiles gardent leur hauteur naturelle (pas de cartes étirées).
class ProdGrid extends StatelessWidget {
  final List<Widget> children;
  final int desktop;
  final int tablet;
  final int mobile;
  final double gap;

  const ProdGrid({super.key, required this.children, this.desktop = 4, this.tablet = 2, this.mobile = 1, this.gap = 14});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth >= 1000 ? desktop : (c.maxWidth >= 600 ? tablet : mobile);
      final width = (c.maxWidth - gap * (cols - 1)) / cols;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [for (final child in children) SizedBox(width: width, child: child)],
      );
    });
  }
}

class ProdSkeleton extends StatelessWidget {
  final double? width;
  final double height;
  const ProdSkeleton({super.key, this.width, required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(color: const Color(0xFFEEF2F6), borderRadius: BorderRadius.circular(6)),
    );
  }
}

// ── Badges ─────────────────────────────────────────────────────────────────

class ProdBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  final bool dot;

  const ProdBadge({super.key, required this.label, required this.color, this.icon, this.dot = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.09),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.28)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (dot) ...[
          Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
        ],
        if (icon != null) ...[
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
        ],
        Text(label, style: tInter(fontSize: 11, fontWeight: FontWeight.w700, color: color, letterSpacing: 0.2)),
      ]),
    );
  }
}

/// BROUILLON / VALIDÉE / ARCHIVÉE.
class ProdStatusBadge extends StatelessWidget {
  final String status;
  const ProdStatusBadge(this.status, {super.key});

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'VALIDEE':
        return const ProdBadge(label: 'VALIDÉE', color: Color(0xFF059669), icon: Icons.check_circle_outline_rounded);
      case 'ARCHIVEE':
        return const ProdBadge(label: 'ARCHIVÉE', color: kProdNeutral, icon: Icons.inventory_2_outlined);
      default:
        return const ProdBadge(label: 'BROUILLON', color: Color(0xFFB45309), icon: Icons.edit_note_rounded);
    }
  }
}

class ProdMachineStateBadge extends StatelessWidget {
  final String state;
  const ProdMachineStateBadge(this.state, {super.key});

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case 'EN_PRODUCTION':
        return const ProdBadge(label: 'En production', color: Color(0xFF059669), dot: true);
      case 'INACTIVE':
        return const ProdBadge(label: 'Inactive', color: kProdNeutral, dot: true);
      default:
        return const ProdBadge(label: 'Active', color: Color(0xFF0369A1), dot: true);
    }
  }
}

class ProdLineBadge extends StatelessWidget {
  final String line;
  final String label;
  const ProdLineBadge({super.key, required this.line, required this.label});

  @override
  Widget build(BuildContext context) => ProdBadge(label: label, color: prodLineColor(line), dot: true);
}

// ── Boutons ────────────────────────────────────────────────────────────────

class ProdButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool primary;
  final bool busy;
  final Color color;

  const ProdButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.primary = false,
    this.busy = false,
    this.color = kCrmText,
  });

  @override
  Widget build(BuildContext context) {
    final leading = busy
        ? SizedBox(
            width: 15,
            height: 15,
            child: CircularProgressIndicator(strokeWidth: 2, color: primary ? Colors.white : color),
          )
        : Icon(icon, size: 17);
    final text = Text(label, style: tInter(fontSize: 13, fontWeight: FontWeight.w700));
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10));
    const padding = EdgeInsets.symmetric(horizontal: 14, vertical: 13);

    if (primary) {
      return ElevatedButton.icon(
        onPressed: busy ? null : onTap,
        icon: leading,
        label: text,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          disabledBackgroundColor: color.withOpacity(0.6),
          disabledForegroundColor: Colors.white,
          elevation: 0,
          padding: padding,
          shape: shape,
        ),
      );
    }
    return OutlinedButton.icon(
      onPressed: busy ? null : onTap,
      icon: leading,
      label: text,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        backgroundColor: kCrmSurface,
        side: const BorderSide(color: kCrmBorder),
        padding: padding,
        shape: shape,
      ),
    );
  }
}

/// Bouton « Exporter » — menu Excel / PDF.
class ProdExportButton extends StatelessWidget {
  final Future<void> Function(String format) onExport;
  final bool busy;

  const ProdExportButton({super.key, required this.onExport, this.busy = false});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      enabled: !busy,
      tooltip: 'Exporter',
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      onSelected: onExport,
      itemBuilder: (_) => [
        _item('xlsx', Icons.grid_on_rounded, 'Excel (.xlsx)', const Color(0xFF059669)),
        _item('pdf', Icons.picture_as_pdf_outlined, 'PDF', kProdWasteColor),
      ],
      // IgnorePointer : le clic doit atteindre le PopupMenuButton, pas le
      // bouton décoratif qu'il enveloppe.
      child: IgnorePointer(
        child: ProdButton(label: 'Exporter', icon: Icons.file_download_outlined, busy: busy, onTap: () {}),
      ),
    );
  }

  PopupMenuItem<String> _item(String value, IconData icon, String label, Color color) => PopupMenuItem<String>(
        value: value,
        height: 40,
        child: Row(children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 10),
          Text(label, style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText)),
        ]),
      );
}

// ── Filtre période ─────────────────────────────────────────────────────────

class ProdPeriodFilter extends StatelessWidget {
  final ProductionPeriod value;
  final ValueChanged<ProductionPeriod> onChanged;

  const ProdPeriodFilter({super.key, required this.value, required this.onChanged});

  Future<void> _pick(BuildContext context, {required bool start}) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final from = value.from ?? DateTime(today.year, today.month, 1);
    final to = value.to ?? today;
    final picked = await showDatePicker(
      context: context,
      initialDate: start ? from : to,
      firstDate: DateTime(2020),
      lastDate: DateTime(today.year + 1, 12, 31),
      helpText: start ? 'Date début' : 'Date fin',
    );
    if (picked == null) return;
    // Garde l'intervalle cohérent : la borne opposée suit si elle est dépassée.
    var newFrom = start ? picked : from;
    var newTo = start ? to : picked;
    if (newFrom.isAfter(newTo)) {
      if (start) {
        newTo = newFrom;
      } else {
        newFrom = newTo;
      }
    }
    onChanged(ProductionPeriod('custom', from: newFrom, to: newTo));
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
      Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.date_range_outlined, size: 16, color: kCrmTextSub),
        const SizedBox(width: 6),
        Text('Période', style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmTextSub)),
      ]),
      Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: kProdHeaderBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: kCrmBorder),
        ),
        child: Wrap(spacing: 2, runSpacing: 2, children: [
          for (final p in ProductionPeriod.presets)
            _segment(p.$2, value.key == p.$1.key, () => onChanged(p.$1)),
          _segment('Personnalisée', value.isCustom, () {
            if (value.isCustom) return;
            onChanged(ProductionPeriod('custom',
                from: DateTime(now.year, now.month, 1), to: DateTime(now.year, now.month, now.day)));
          }),
        ]),
      ),
      if (value.isCustom) ...[
        _dateField(context, 'Date début', value.from, () => _pick(context, start: true)),
        _dateField(context, 'Date fin', value.to, () => _pick(context, start: false)),
      ],
    ]);
  }

  Widget _segment(String label, bool selected, VoidCallback onTap) {
    return Material(
      color: selected ? kCrmSurface : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      elevation: selected ? 0.6 : 0,
      shadowColor: const Color(0x330F172A),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(label,
              style: tInter(
                  fontSize: 12.5,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? kCrmText : kCrmTextSub)),
        ),
      ),
    );
  }

  Widget _dateField(BuildContext context, String label, DateTime? date, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: kCrmSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: kCrmBorder),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('$label  ', style: tInter(fontSize: 11.5, color: kCrmTextSub)),
          Text(date == null ? '—' : DateFormat('dd/MM/yyyy').format(date),
              style: tInter(fontSize: 12.5, fontWeight: FontWeight.w700, color: kCrmText)),
          const SizedBox(width: 8),
          const Icon(Icons.calendar_today_outlined, size: 13, color: kCrmTextSub),
        ]),
      ),
    );
  }
}

// ── Liste déroulante de filtre ─────────────────────────────────────────────

class ProdFilterDropdown<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<(T, String)> items;
  final ValueChanged<T?> onChanged;
  final double width;

  const ProdFilterDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.width = 180,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: DropdownButtonFormField<T?>(
        // La clé force la reconstruction quand la valeur change de l'extérieur
        // (« Réinitialiser ») : initialValue n'est lu qu'à la création.
        key: ValueKey<T?>(value),
        initialValue: value,
        isExpanded: true,
        isDense: true,
        icon: const Icon(Icons.expand_more_rounded, size: 18, color: kCrmTextSub),
        style: tInter(fontSize: 13, fontWeight: FontWeight.w600, color: kCrmText),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: tInter(fontSize: 12.5, color: kCrmTextSub),
          isDense: true,
          filled: true,
          fillColor: kCrmSurface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: kCrmBorder)),
        ),
        items: [
          DropdownMenuItem<T?>(value: null, child: Text('Tous', style: tInter(fontSize: 13, color: kCrmTextSub))),
          for (final item in items)
            DropdownMenuItem<T?>(value: item.$1, child: Text(item.$2, overflow: TextOverflow.ellipsis)),
        ],
        onChanged: onChanged,
      ),
    );
  }
}

// ── Tableau ────────────────────────────────────────────────────────────────

class ProdColumn {
  final String label;
  final double width; // largeur minimale ; l'espace restant est réparti
  final bool numeric;
  const ProdColumn(this.label, this.width, {this.numeric = false});
}

/// Tableau à en-tête fixe en majuscules, lignes séparées par un filet. Sur
/// petit écran il conserve ses largeurs minimales et défile horizontalement.
class ProdTable extends StatelessWidget {
  final List<ProdColumn> columns;
  final List<List<Widget>> rows;
  final List<VoidCallback?>? onRowTap;
  final String emptyLabel;

  const ProdTable({
    super.key,
    required this.columns,
    required this.rows,
    this.onRowTap,
    this.emptyLabel = 'Aucune production sur cette période',
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final minWidth = columns.fold<double>(0, (s, col) => s + col.width);
      final scale = c.maxWidth > minWidth ? c.maxWidth / minWidth : 1.0;
      final widths = [for (final col in columns) col.width * scale];

      Widget cells(List<Widget> children, {bool header = false}) => Row(children: [
            for (int i = 0; i < columns.length; i++)
              Container(
                width: widths[i],
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: header ? 10 : 12),
                alignment: columns[i].numeric ? Alignment.centerRight : Alignment.centerLeft,
                child: children[i],
              ),
          ]);

      final table = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          decoration: const BoxDecoration(
            color: kProdHeaderBg,
            border: Border(bottom: BorderSide(color: kCrmBorder)),
          ),
          child: cells([
            for (final col in columns)
              Text(col.label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tInter(fontSize: 10.5, fontWeight: FontWeight.w800, color: kCrmTextSub, letterSpacing: 0.6)),
          ], header: true),
        ),
        if (rows.isEmpty)
          SizedBox(
            width: widths.fold<double>(0, (s, w) => s + w),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 34),
              child: Column(children: [
                Icon(Icons.inbox_outlined, size: 30, color: kCrmTextSub.withOpacity(0.5)),
                const SizedBox(height: 8),
                Text(emptyLabel, style: tInter(fontSize: 13, color: kCrmTextSub)),
              ]),
            ),
          ),
        for (int r = 0; r < rows.length; r++)
          Material(
            color: kCrmSurface,
            child: InkWell(
              onTap: onRowTap == null ? null : onRowTap![r],
              hoverColor: const Color(0xFFF8FAFC),
              child: Container(
                decoration: BoxDecoration(
                  border: r == rows.length - 1 ? null : const Border(bottom: BorderSide(color: Color(0xFFEEF2F6))),
                ),
                child: cells(rows[r]),
              ),
            ),
          ),
      ]);

      return SingleChildScrollView(scrollDirection: Axis.horizontal, child: table);
    });
  }
}

/// Cellule texte standard du tableau.
class ProdCell extends StatelessWidget {
  final String text;
  final bool strong;
  final bool mono;
  final Color? color;

  const ProdCell(this.text, {super.key, this.strong = false, this.mono = false, this.color});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: tInter(
        fontSize: 13,
        fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
        color: color ?? (strong ? kCrmText : const Color(0xFF334155)),
        letterSpacing: mono ? 0.2 : null,
      ),
    );
  }
}

/// Bouton d'action discret d'une ligne de tableau.
class ProdRowAction extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final Color color;

  const ProdRowAction({super.key, required this.icon, required this.tooltip, required this.onTap, this.color = kProdNeutral});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: kCrmBorder),
            color: kCrmSurface,
          ),
          child: Icon(icon, size: 15, color: enabled ? color : kCrmBorder),
        ),
      ),
    );
  }
}

// ── États ──────────────────────────────────────────────────────────────────

class ProdErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ProdErrorState({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ProdCard(
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, color: kProdWasteColor, size: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Données de production indisponibles',
                style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText)),
            const SizedBox(height: 2),
            Text(message.replaceFirst('Exception: ', ''), style: tInter(fontSize: 12.5, color: kCrmTextSub)),
          ]),
        ),
        const SizedBox(width: 12),
        ProdButton(label: 'Réessayer', icon: Icons.refresh_rounded, onTap: onRetry),
      ]),
    );
  }
}

/// Paire libellé / valeur (fiche, cartes de ligne).
class ProdField extends StatelessWidget {
  final String label;
  final Widget value;
  const ProdField({super.key, required this.label, required this.value});

  factory ProdField.text(String label, String value) =>
      ProdField(label: label, value: Text(value, style: tInter(fontSize: 14, fontWeight: FontWeight.w700, color: kCrmText)));

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(label.toUpperCase(),
          style: tInter(fontSize: 10.5, fontWeight: FontWeight.w700, color: kCrmTextSub, letterSpacing: 0.5)),
      const SizedBox(height: 5),
      value,
    ]);
  }
}
