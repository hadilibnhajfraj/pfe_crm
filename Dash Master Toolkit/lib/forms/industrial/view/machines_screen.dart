// lib/forms/industrial/view/machines_screen.dart
//
// Référentiel Machines (règle D) — une seule entité pour PROBAR et PROMESH.
// responsable_logistique_achat et administrateurs : consulter, ajouter,
// modifier, activer/désactiver. Pas de suppression (l'historique des fiches
// référence la machine). Chaque machine ouvre sa page de production — y
// compris une machine ajoutée après PROBAR-04 / PROMESH-04, que le menu
// latéral (4 machines fixes par ligne) ne liste pas.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../model/machine_model.dart';
import '../service/machine_service.dart';
import '../service/machine_catalog.dart';
import '../theme/industrial_theme.dart';

class MachinesScreen extends StatefulWidget {
  const MachinesScreen({super.key});

  @override
  State<MachinesScreen> createState() => _MachinesScreenState();
}

class _MachinesScreenState extends State<MachinesScreen> {
  static const _types = ['PROBAR', 'PROMESH'];

  List<MachineModel> _machines = [];
  String? _typeFilter; // null = toutes
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await MachineService.instance.fetchAll(typeMachine: _typeFilter);
      if (mounted) setState(() => _machines = list);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _colorOf(String type) => type == 'PROMESH' ? kPromeshColor : kProbarColor;

  void _snack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? Colors.red.shade700 : null),
    );
  }

  Future<void> _run(Future<void> Function() action, String success) async {
    try {
      await action();
      _snack(success);
      await _load();
      // Menu Production et écrans industriels : la nouvelle machine (ou son
      // nouveau statut) apparaît immédiatement, sans recharger l'application.
      await MachineCatalog.instance.refresh();
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''), error: true);
    }
  }

  // ── Ajout / modification ───────────────────────────────────────────────
  Future<void> _openForm({MachineModel? machine}) async {
    final isEdit = machine != null;
    String type = machine?.typeMachine ?? _typeFilter ?? _types.first;
    final numeroCtrl = TextEditingController(text: machine?.numero.toString() ?? '');
    final codeCtrl = TextEditingController(text: machine?.code ?? '');
    final nomCtrl = TextEditingController(text: machine?.nom ?? '');
    final descCtrl = TextEditingController(text: machine?.description ?? '');

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: Text(isEdit ? 'Modifier ${machine.code}' : 'Ajouter une machine'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: const InputDecoration(labelText: 'Type de machine'),
                  items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                  onChanged: (v) => setLocal(() => type = v ?? type),
                ),
                TextField(
                  controller: numeroCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Numéro (ex. 5)'),
                ),
                TextField(
                  controller: codeCtrl,
                  decoration: InputDecoration(
                    labelText: 'Code',
                    hintText: isEdit ? null : 'Automatique (ex. $type-05)',
                  ),
                ),
                TextField(
                  controller: nomCtrl,
                  decoration: InputDecoration(
                    labelText: 'Nom',
                    hintText: isEdit ? null : 'Automatique (ex. Machine $type 5)',
                  ),
                ),
                TextField(
                  controller: descCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                if (isEdit)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'Le type et le numéro ne peuvent plus changer si des fiches de production sont rattachées à la machine.',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Annuler')),
            ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Enregistrer')),
          ],
        ),
      ),
    );

    if (saved != true) return;
    final numero = int.tryParse(numeroCtrl.text.trim());
    if (numero == null || numero < 1) {
      _snack('Numéro invalide (entier à partir de 1)', error: true);
      return;
    }

    if (isEdit) {
      final fields = <String, dynamic>{
        if (type != machine.typeMachine) 'typeMachine': type,
        if (numero != machine.numero) 'numero': numero,
        if (codeCtrl.text.trim() != machine.code) 'code': codeCtrl.text.trim(),
        if (nomCtrl.text.trim() != machine.nom) 'nom': nomCtrl.text.trim(),
        if (descCtrl.text.trim() != (machine.description ?? '')) 'description': descCtrl.text.trim(),
      };
      if (fields.isEmpty) return;
      await _run(() => MachineService.instance.update(machine.id, fields), 'Machine modifiée');
    } else {
      await _run(
        () => MachineService.instance.create(
          typeMachine: type,
          numero: numero,
          code: codeCtrl.text,
          nom: nomCtrl.text,
          description: descCtrl.text.trim().isEmpty ? null : descCtrl.text.trim(),
        ),
        'Machine ajoutée',
      );
    }
  }

  Future<void> _toggleStatut(MachineModel m) async {
    final target = m.isActive ? 'INACTIVE' : 'ACTIVE';
    await _run(
      () => MachineService.instance.setStatut(m.id, target),
      m.isActive ? '${m.code} désactivée' : '${m.code} activée',
    );
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.settings_input_component_outlined, size: 28),
                const SizedBox(width: 10),
                Text('Machines', style: Theme.of(context).textTheme.headlineSmall),
                const Spacer(),
                ElevatedButton.icon(
                  onPressed: () => _openForm(),
                  icon: const Icon(Icons.add),
                  label: const Text('Ajouter une machine'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Toutes'),
                  selected: _typeFilter == null,
                  onSelected: (_) {
                    setState(() => _typeFilter = null);
                    _load();
                  },
                ),
                for (final t in _types)
                  ChoiceChip(
                    label: Text(t),
                    selected: _typeFilter == t,
                    selectedColor: _colorOf(t).withValues(alpha: 0.2),
                    onSelected: (_) {
                      setState(() => _typeFilter = t);
                      _load();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _load, child: const Text('Réessayer')),
          ],
        ),
      );
    }
    if (_machines.isEmpty) return const Center(child: Text('Aucune machine.'));

    return ListView.separated(
      itemCount: _machines.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final m = _machines[i];
        final color = _colorOf(m.typeMachine);
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: color.withValues(alpha: 0.35)),
          ),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.15),
              child: Icon(Icons.precision_manufacturing_outlined, color: color),
            ),
            title: Text('${m.code} — ${m.nom}', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              [
                '${m.typeMachine} · n° ${m.numero}',
                if ((m.description ?? '').isNotEmpty) m.description!,
              ].join('\n'),
            ),
            isThreeLine: (m.description ?? '').isNotEmpty,
            trailing: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                Chip(
                  label: Text(m.isActive ? 'Active' : 'Inactive'),
                  backgroundColor: m.isActive ? Colors.green.shade50 : Colors.red.shade50,
                  labelStyle: TextStyle(color: m.isActive ? Colors.green.shade800 : Colors.red.shade800),
                ),
                Switch(value: m.isActive, onChanged: (_) => _toggleStatut(m)),
                IconButton(
                  tooltip: 'Modifier',
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () => _openForm(machine: m),
                ),
                IconButton(
                  tooltip: 'Ouvrir la production',
                  icon: const Icon(Icons.open_in_new),
                  onPressed: m.isActive ? () => context.go(m.productionRoute) : null,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
