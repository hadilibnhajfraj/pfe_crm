// lib/forms/production/view/widgets/production_machine_picker.dart
//
// « Nouvelle fiche » : une fiche de production se crée toujours depuis une
// machine puis un poste (parcours existant, inchangé). Ce dialogue liste les
// machines ACTIVES de la ligne (référentiel MachineCatalog, GET /machines) et
// ouvre la page de la machine choisie.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:dash_master_toolkit/forms/view/pipeline_theme.dart';
import 'package:dash_master_toolkit/forms/industrial/service/machine_catalog.dart';

import 'production_widgets.dart';

Future<void> showProductionMachinePicker(BuildContext context, {required String line}) async {
  final catalog = MachineCatalog.instance;
  await catalog.ensureLoaded();
  if (!context.mounted) return;

  final label = line.toUpperCase();
  final color = prodLineColor(line);
  final machines = catalog.ofType(label, activeOnly: true);

  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: kCrmSurface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      titlePadding: const EdgeInsets.fromLTRB(22, 20, 22, 4),
      contentPadding: const EdgeInsets.fromLTRB(22, 8, 22, 8),
      title: Text('Nouvelle fiche $label', style: tInter(fontSize: 17, fontWeight: FontWeight.w800, color: kCrmText)),
      content: SizedBox(
        width: 380,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Choisissez la machine, puis le poste.', style: tInter(fontSize: 13, color: kCrmTextSub)),
          const SizedBox(height: 14),
          if (machines.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                catalog.error != null ? 'Machines indisponibles : ${catalog.error}' : 'Aucune machine active sur cette ligne.',
                style: tInter(fontSize: 13, color: kCrmTextSub),
              ),
            ),
          for (final m in machines)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: kCrmSurface,
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () {
                    Navigator.of(dialogContext).pop();
                    context.go(m.productionRoute);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: kCrmBorder),
                    ),
                    child: Row(children: [
                      Icon(Icons.precision_manufacturing_outlined, size: 19, color: color),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(m.code, style: tInter(fontSize: 13.5, fontWeight: FontWeight.w800, color: kCrmText)),
                          Text(m.nom, style: tInter(fontSize: 12, color: kCrmTextSub)),
                        ]),
                      ),
                      const Icon(Icons.chevron_right_rounded, size: 20, color: kCrmTextSub),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: Text('Annuler', style: tInter(fontSize: 13, fontWeight: FontWeight.w700, color: kCrmTextSub)),
        ),
      ],
    ),
  );
}
