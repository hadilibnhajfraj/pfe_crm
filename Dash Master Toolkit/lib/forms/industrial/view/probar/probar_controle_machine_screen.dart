// lib/forms/industrial/view/probar/probar_controle_machine_screen.dart
//
// Écran unique "Contrôle Machine" — fusionne les anciens sous-écrans Qualité
// Mesures + État Machine. Suit le modèle des écrans-module "feuille" (ex.
// probar_rendement_screen.dart) : un seul Enregistrer/Suivant, retour direct
// à la grille des modules.
//
// Le module PROBAR n'a plus de section "Contrôle Process" (supprimée de
// l'interface — voir ProbarController._processControlRaw pour la
// préservation silencieuse des données des fiches existantes).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:get/get.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/route/my_route.dart';
import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/theme/industrial_theme.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';
import '../../controller/probar_controller.dart';
import 'probar_module_scaffold.dart';

const _kQualiteColor = Color(0xFF3B82F6);
const _kLines = ['L1', 'L2', 'L3', 'L4'];

class ProbarControleMachineScreen extends StatefulWidget {
  final String machine;
  final String poste;
  final String ficheId;
  const ProbarControleMachineScreen({
    super.key,
    required this.machine,
    required this.poste,
    required this.ficheId,
  });

  @override
  State<ProbarControleMachineScreen> createState() => _ProbarControleMachineScreenState();
}

class _ProbarControleMachineScreenState extends State<ProbarControleMachineScreen> {
  late final ProbarController c;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    c = Get.isRegistered<ProbarController>()
        ? Get.find<ProbarController>()
        : Get.put(ProbarController(), permanent: true);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await c.bootstrapWithId(widget.machine, widget.poste, widget.ficheId);
    if (!mounted) return;
    if (c.isLocked.value) {
      context.go(_fichePath);
      return;
    }
    setState(() => _loading = false);
  }

  String get _base =>
      '${MyRoute.productionProbarRoot}/machine/${widget.machine}/poste/${widget.poste}';
  String get _fichePath => '$_base/dashboard';
  String get _modulesPath => '$_base/modules?ficheId=${widget.ficheId}';

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(AppLocalizations.of(context).translate('Contrôle Machine enregistré')),
          backgroundColor: kCrmSuccess,
          duration: const Duration(seconds: 2),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _saveAndReturnToModules() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await c.saveDraft();
      if (mounted) context.go(_modulesPath);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${AppLocalizations.of(context).translate('Erreur')} : $e'), backgroundColor: kCrmDanger));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ProbarModuleScaffold(
      title: 'Contrôle Machine',
      icon: Icons.precision_manufacturing_rounded,
      color: kMaintenanceColor,
      machine: widget.machine,
      poste: widget.poste,
      backRoute: _modulesPath,
      loading: _loading,
      saving: _saving,
      onSave: _save,
      onNext: _saveAndReturnToModules,
      nextLabel: 'Suivant',
      nextIcon: Icons.arrow_forward_rounded,
      controller: c,
      child: _ControleMachineBody(c: c, machine: widget.machine),
    );
  }
}

// Mapping machine → ligne affichée : Machine 1 → L1, Machine 2 → L2,
// Machine 3 → L3, Machine 4 → L4 (indices 0-3 dans _kLines/qmLx). Une
// machine physique ne mesure qu'une seule ligne de production — les 3
// autres jeux de champs (qmL{n}Hauteur/Largeur/Maille) restent dans le
// modèle/le backend pour compatibilité avec les fiches existantes, mais ne
// sont plus affichés ni saisissables ici.
int _lineIndexForMachine(String machine) => ((int.tryParse(machine) ?? 1) - 1).clamp(0, 3);

class _ControleMachineBody extends StatelessWidget {
  final ProbarController c;
  final String machine;
  const _ControleMachineBody({required this.c, required this.machine});

  TextEditingController _hauteur(int i) => switch (i) {
        0 => c.qmL1Hauteur,
        1 => c.qmL2Hauteur,
        2 => c.qmL3Hauteur,
        _ => c.qmL4Hauteur,
      };

  TextEditingController _largeur(int i) => switch (i) {
        0 => c.qmL1Largeur,
        1 => c.qmL2Largeur,
        2 => c.qmL3Largeur,
        _ => c.qmL4Largeur,
      };

  TextEditingController _maille(int i) => switch (i) {
        0 => c.qmL1Maille,
        1 => c.qmL2Maille,
        2 => c.qmL3Maille,
        _ => c.qmL4Maille,
      };

  TextEditingController _diametre(int i) => switch (i) {
        0 => c.qmL1Diametre,
        1 => c.qmL2Diametre,
        2 => c.qmL3Diametre,
        _ => c.qmL4Diametre,
      };

  @override
  Widget build(BuildContext context) {
    final lineIndex = _lineIndexForMachine(machine);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // ── Mesures qualité (ex. sous-écran "Qualité Mesures") ───────────────
      // Une seule ligne affichée : celle qui correspond à la machine de
      // cette fiche (voir _lineIndexForMachine).
      Text(AppLocalizations.of(context).translate('Mesures qualité'), style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text('${AppLocalizations.of(context).translate('Saisissez les mesures pour la ligne de production')} ${_kLines[lineIndex]} (${AppLocalizations.of(context).translate('Machine')} $machine).',
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 24),
      _LineCard(
        line: _kLines[lineIndex],
        color: _kQualiteColor,
        controller: c,
        heure: _hauteur(lineIndex),
        longueur: _largeur(lineIndex),
        grammage: _maille(lineIndex),
        diametre: _diametre(lineIndex),
      ),
      const SizedBox(height: 14),
      _MeasureCard(
        icon: Icons.thermostat_rounded,
        title: 'Température produit (°C)',
        color: _kQualiteColor,
        child: _numField(context, c.qmTemperature, 'Ex: 55', '°C', _kQualiteColor),
      ),
      const SizedBox(height: 28),

      // ── État machine (ex. sous-écran "État Machine") ─────────────────────
      Text(AppLocalizations.of(context).translate('État machine'), style: tInter(fontSize: 16, fontWeight: FontWeight.w900, color: kCrmText)),
      const SizedBox(height: 6),
      Text(AppLocalizations.of(context).translate('Renseignez l\'état de chaque paramètre machine.'),
          style: tInter(fontSize: 13, color: kCrmTextSub)),
      const SizedBox(height: 24),

      _MachineParamCard(
        icon: Icons.local_fire_department_rounded,
        title: 'FOUR',
        color: kMaintenanceColor,
        child: LayoutBuilder(builder: (context, constraints) {
          final columns = constraints.maxWidth >= 420 ? 3 : (constraints.maxWidth >= 280 ? 2 : 1);
          const spacing = 10.0;
          final fieldWidth = (constraints.maxWidth - spacing * (columns - 1)) / columns;
          return Wrap(spacing: spacing, runSpacing: 12, children: [
            SizedBox(width: fieldWidth, child: _zoneField(context, 'Zone 1', c.fourZone1, kMaintenanceColor)),
            SizedBox(width: fieldWidth, child: _zoneField(context, 'Zone 2', c.fourZone2, kMaintenanceColor)),
            SizedBox(width: fieldWidth, child: _zoneField(context, 'Zone 3', c.fourZone3, kMaintenanceColor)),
          ]);
        }),
      ),
      _MachineParamCard(
        icon: Icons.air,
        title: 'Air (bars)',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['>= 6 bars', '< 6 bars'],
              value: c.air.value,
              onChanged: (v) => c.air.value = v,
              negativeValues: const ['< 6 bars'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.opacity,
        title: 'Niveau Bain Eau',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['Bon', 'Moyen', 'Mauvais'],
              value: c.niveauBainEau.value,
              onChanged: (v) => c.niveauBainEau.value = v,
              negativeValues: const ['Mauvais'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.thermostat,
        title: 'Température Eau (°C)',
        subtitle: '40 - 60 °C',
        color: kMaintenanceColor,
        child: AnimatedBuilder(
          animation: c.temperatureEau,
          builder: (_, __) {
            final outOfRange = c.controleMachineTemperatureEauOutOfRange;
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              TextField(
                controller: c.temperatureEau,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  hintText: AppLocalizations.of(context).translate('Ex: 52'),
                  suffixText: '°C',
                  filled: true,
                  fillColor: outOfRange ? kCrmDanger.withOpacity(0.06) : kCrmBg,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: outOfRange ? kCrmDanger : kCrmBorder)),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(
                          color: outOfRange ? kCrmDanger : kMaintenanceColor, width: 2)),
                ),
              ),
              if (outOfRange) ...[
                const SizedBox(height: 6),
                Row(children: [
                  const Icon(Icons.warning_amber_rounded, size: 14, color: kCrmDanger),
                  const SizedBox(width: 4),
                  Text(AppLocalizations.of(context).translate('Hors plage (40-60 °C)'), style: tInter(fontSize: 11.5, color: kCrmDanger)),
                ]),
              ],
            ]);
          },
        ),
      ),
      _MachineParamCard(
        icon: Icons.rotate_right_rounded,
        title: 'Bobine',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.bobine.value,
              onChanged: (v) => c.bobine.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.tag_rounded,
        title: 'Nombre des bobines',
        color: kMaintenanceColor,
        child: TextField(
          controller: c.nombreBobines,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            hintText: AppLocalizations.of(context).translate('Ex: 12'),
            filled: true,
            fillColor: kCrmBg,
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: kCrmBorder)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: kMaintenanceColor, width: 2)),
          ),
        ),
      ),
      _MachineParamCard(
        icon: Icons.electrical_services_rounded,
        title: 'Résistance',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.resistance.value,
              onChanged: (v) => c.resistance.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.water_rounded,
        title: 'Bain d\'eau et filtre',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.bainEauFiltre.value,
              onChanged: (v) => c.bainEauFiltre.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.settings_input_component_rounded,
        title: 'Machine Ceinture',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.machineCeinture.value,
              onChanged: (v) => c.machineCeinture.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.wind_power_rounded,
        title: 'Machine Bobinage',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.machineBobinage.value,
              onChanged: (v) => c.machineBobinage.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.settings_rounded,
        title: 'État Pistons',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['Propre', 'Sale'],
              value: c.etatPistons.value,
              onChanged: (v) => c.etatPistons.value = v,
              negativeValues: const ['Sale'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.blur_on,
        title: 'Fuite Visuelle',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['Absence', 'Présence'],
              value: c.fluideVisuel.value,
              onChanged: (v) => c.fluideVisuel.value = v,
              negativeValues: const ['Présence'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.circle_outlined,
        title: 'État Disque de Coupe',
        color: kMaintenanceColor,
        child: Obx(() => _RadioGroup(
              options: const ['OK', 'NOK'],
              value: c.etatDisqueCoupe.value,
              onChanged: (v) => c.etatDisqueCoupe.value = v,
              negativeValues: const ['NOK'],
            )),
      ),
      _MachineParamCard(
        icon: Icons.note_alt_outlined,
        title: 'Justification / Observations',
        color: kMaintenanceColor,
        child: TextField(
          controller: c.justificationControleMachine,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: AppLocalizations.of(context).translate('Observations complémentaires…'),
            filled: true,
            fillColor: kCrmBg,
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: kCrmBorder)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: kMaintenanceColor, width: 2)),
            contentPadding: const EdgeInsets.all(12),
          ),
        ),
      ),
    ]);
  }

  static Widget _numField(BuildContext context, TextEditingController ctrl, String hint, String suffix, Color color) {
    return TextField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        hintText: AppLocalizations.of(context).translate(hint),
        suffixText: suffix.isEmpty ? null : suffix,
        filled: true,
        fillColor: kCrmBg,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: kCrmBorder)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: color, width: 2)),
      ),
    );
  }

  static Widget _zoneField(BuildContext context, String label, TextEditingController ctrl, Color color) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11, fontWeight: FontWeight.w600, color: kCrmTextSub)),
      const SizedBox(height: 4),
      TextField(
        controller: ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          hintText: '0.0',
          suffixText: '°C',
          filled: true,
          fillColor: kCrmBg,
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: kCrmBorder)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: color, width: 2)),
        ),
      ),
    ]);
  }
}

class _LineCard extends StatelessWidget {
  final String line;
  final Color color;
  final ProbarController controller;
  final TextEditingController heure;
  final TextEditingController longueur;
  final TextEditingController grammage;
  final TextEditingController diametre;

  const _LineCard({
    required this.line,
    required this.color,
    required this.controller,
    required this.heure,
    required this.longueur,
    required this.grammage,
    required this.diametre,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Center(
              child: Text(line,
                  style: tInter(fontSize: 13, fontWeight: FontWeight.w900, color: color)),
            ),
          ),
          const SizedBox(width: 10),
          Text('${AppLocalizations.of(context).translate('Ligne')} $line',
              style: tInter(fontSize: 14, fontWeight: FontWeight.w800, color: kCrmText)),
        ]),
        const SizedBox(height: 16),
        // Heure | Longueur (mm) | Grammage (g/m²) | Diamètre (mm) — 4
        // colonnes sur écran large, repli responsive à 2 puis 1 colonne(s)
        // sur écran étroit (même carte/bordures/espacements que le reste).
        LayoutBuilder(builder: (context, constraints) {
          final columns = constraints.maxWidth >= 560 ? 4 : (constraints.maxWidth >= 340 ? 2 : 1);
          const spacing = 10.0;
          final fieldWidth = (constraints.maxWidth - spacing * (columns - 1)) / columns;
          return Wrap(spacing: spacing, runSpacing: 12, children: [
            SizedBox(width: fieldWidth, child: _heureField(context)),
            SizedBox(width: fieldWidth, child: _field(context, 'Longueur (mm)', longueur, 'mm')),
            SizedBox(width: fieldWidth, child: _field(context, 'Grammage (g/m²)', grammage, 'g/m²')),
            SizedBox(width: fieldWidth, child: _field(context, 'Diamètre (mm)', diametre, 'mm')),
          ]);
        }),
      ]),
    );
  }

  // Champ "Heure" — sélecteur d'heure (showTimePicker), même style visuel
  // (bordure/fond/radius) qu'un TextField standard de cette carte.
  Widget _heureField(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate('Heure'), style: tInter(fontSize: 11, fontWeight: FontWeight.w600, color: kCrmTextSub)),
      const SizedBox(height: 4),
      AnimatedBuilder(
        animation: heure,
        builder: (_, __) => InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => controller.pickQmHeure(context, heure),
          child: InputDecorator(
            decoration: InputDecoration(
              isDense: true,
              suffixIcon: Icon(Icons.schedule_outlined, size: 18, color: color),
              filled: true,
              fillColor: kCrmBg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: kCrmBorder)),
            ),
            child: Text(
              heure.text.isEmpty ? '--:--' : heure.text,
              style: tInter(fontSize: 13, color: heure.text.isEmpty ? kCrmTextSub : kCrmText),
            ),
          ),
        ),
      ),
    ]);
  }

  Widget _field(BuildContext context, String label, TextEditingController ctrl, String suffix) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(AppLocalizations.of(context).translate(label), style: tInter(fontSize: 11, fontWeight: FontWeight.w600, color: kCrmTextSub)),
      const SizedBox(height: 4),
      TextField(
        controller: ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(
          hintText: '0.0',
          suffixText: suffix,
          filled: true,
          fillColor: kCrmBg,
          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: kCrmBorder)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: color, width: 2)),
        ),
      ),
    ]);
  }
}

class _MeasureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  final Widget child;

  const _MeasureCard({
    required this.icon,
    required this.title,
    required this.color,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 10),
          Text(AppLocalizations.of(context).translate(title), style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText)),
        ]),
        const SizedBox(height: 12),
        child,
      ]),
    );
  }
}

class _MachineParamCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final Widget child;

  const _MachineParamCard({
    required this.icon,
    required this.title,
    required this.color,
    required this.child,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCrmSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kCrmBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(AppLocalizations.of(context).translate(title),
                  style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText)),
              if (subtitle != null)
                Text(AppLocalizations.of(context).translate(subtitle!), style: tInter(fontSize: 11, color: kCrmTextSub)),
            ]),
          ),
        ]),
        const SizedBox(height: 12),
        child,
      ]),
    );
  }
}

class _RadioGroup extends StatelessWidget {
  final List<String> options;
  final String? value;
  final ValueChanged<String?> onChanged;
  final List<String> negativeValues;

  const _RadioGroup({
    required this.options,
    required this.value,
    required this.onChanged,
    this.negativeValues = const [],
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 10, runSpacing: 8, children: [
      for (final option in options)
        GestureDetector(
          onTap: () => onChanged(option),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: value == option
                  ? (negativeValues.contains(option) ? kCrmDanger : kCrmSuccess).withOpacity(0.12)
                  : kCrmBg,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: value == option
                    ? (negativeValues.contains(option) ? kCrmDanger : kCrmSuccess)
                    : kCrmBorder,
                width: value == option ? 1.5 : 1,
              ),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (value == option) ...[
                Icon(
                  negativeValues.contains(option)
                      ? Icons.cancel_rounded
                      : Icons.check_circle_rounded,
                  size: 14,
                  color: negativeValues.contains(option) ? kCrmDanger : kCrmSuccess,
                ),
                const SizedBox(width: 4),
              ],
              Text(
                AppLocalizations.of(context).translate(option),
                style: tInter(
                  fontSize: 12.5,
                  fontWeight: value == option ? FontWeight.w700 : FontWeight.w500,
                  color: value == option
                      ? (negativeValues.contains(option) ? kCrmDanger : kCrmSuccess)
                      : kCrmText,
                ),
              ),
            ]),
          ),
        ),
    ]);
  }
}
