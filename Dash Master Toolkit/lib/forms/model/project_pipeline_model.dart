// lib/forms/model/project_pipeline_model.dart
//
// Typed models for the CRM pipeline Kanban board.
// normalizeIntoMap() writes resolved values back into the raw Map so the
// card/board code can read simple, guaranteed keys.

import 'package:flutter/foundation.dart';

// ── Owner ─────────────────────────────────────────────────────────────────────

class OwnerModel {
  final String id;
  final String fullName;
  final String email;
  final String avatarUrl;

  const OwnerModel({
    this.id = '',
    this.fullName = '',
    this.email = '',
    this.avatarUrl = '',
  });

  bool get isEmpty => fullName.isEmpty && email.isEmpty;

  /// Best display name: fullName → email (as display) → empty.
  String get displayName {
    if (fullName.isNotEmpty) return fullName;
    if (email.isNotEmpty) return email;
    return '';
  }

  /// Secondary label shown below the name (email when fullName is available).
  String get displayEmail => email;

  factory OwnerModel.fromJson(Map<String, dynamic> j) {
    return OwnerModel(
      id: _str(j['_id'] ?? j['id']),
      fullName: _firstOf([
        j['fullName'],
        j['name'],
        j['nom'],
        _join(j['prenom'], j['nom']),
        _join(j['firstName'], j['lastName']),
        j['username'],
        j['displayName'],
      ]),
      email: _str(j['email'] ?? j['mail'] ?? j['emailAddress']),
      avatarUrl: _firstOf([
        j['avatar'],
        j['avatarUrl'],
        j['photo'],
        j['picture'],
        j['profileImage'],
        j['image'],
        j['profilePicture'],
      ]),
    );
  }

  static String _str(dynamic v) => (v ?? '').toString().trim();

  static String _join(dynamic a, dynamic b) {
    final f = _str(a);
    final l = _str(b);
    if (f.isEmpty && l.isEmpty) return '';
    if (f.isEmpty) return l;
    if (l.isEmpty) return f;
    return '$f $l';
  }

  static String _firstOf(List<dynamic> vals) {
    for (final v in vals) {
      if (v == null) continue;
      final s = v.toString().trim();
      // Skip obviously non-name values: objects, arrays, bare MongoDB IDs.
      if (s.isEmpty) continue;
      if (s.startsWith('{') || s.startsWith('[')) continue;
      if (s.length >= 24 && RegExp(r'^[a-f0-9]+$').hasMatch(s)) continue;
      return s;
    }
    return '';
  }
}

// ── Project ───────────────────────────────────────────────────────────────────

class ProjectPipelineModel {
  final String id;
  final String nomProjet;
  final String entreprise;
  final String statut;
  final String currentAction; // CRM action stage badge
  final OwnerModel? owner;
  final double? pourcentageReussite;
  final String createdAt;

  const ProjectPipelineModel({
    required this.id,
    required this.nomProjet,
    required this.entreprise,
    required this.statut,
    required this.currentAction,
    this.owner,
    this.pourcentageReussite,
    this.createdAt = '',
  });

  // ── fromJson ────────────────────────────────────────────────────────────────
  factory ProjectPipelineModel.fromJson(Map<String, dynamic> j) {
    return ProjectPipelineModel(
      id: _resolveId(j),
      nomProjet: _resolveNom(j),
      entreprise: _str(j['entreprise'] ?? j['company']),
      statut: _str(j['statut'] ?? j['status']),
      currentAction: _resolveCurrentAction(j),
      owner: _resolveOwner(j),
      pourcentageReussite: _toDouble(j['pourcentageReussite']),
      createdAt: _str(j['createdAt'] ?? j['dateCreation'] ?? j['created_at']),
    );
  }

  // ── Normalize into raw Map ──────────────────────────────────────────────────
  /// Writes canonical field values back into [raw] so the card can always read
  /// `p['nomProjet']`, `p['ownerName']`, `p['currentAction']` unconditionally.
  Map<String, dynamic> normalizeIntoMap(Map<String, dynamic> raw) {
    raw['id']            = id;
    raw['nomProjet']     = nomProjet;
    raw['entreprise']    = entreprise;
    raw['ownerName']     = owner?.displayName ?? '';
    raw['ownerEmail']    = owner?.displayEmail ?? '';
    raw['ownerAvatar']   = owner?.avatarUrl ?? '';
    raw['currentAction'] = currentAction;

    if (kDebugMode) {
      debugPrint(
        '[Pipeline] normalized → id=$id  '
        'nom=$nomProjet  owner=${owner?.displayName}  action=$currentAction',
      );
    }
    return raw;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  static String _str(dynamic v) => (v ?? '').toString().trim();

  static String _resolveId(Map<String, dynamic> j) =>
      _str(j['id'] ?? j['_id']);

  static String _resolveNom(Map<String, dynamic> j) {
    // Direct field search (all known names)
    for (final key in [
      'nomProjet', 'name', 'title', 'projectName', 'projet',
      'nom', 'projetNom', 'projectTitle', 'label',
    ]) {
      final v = _str(j[key]);
      if (v.isNotEmpty) return v;
    }
    // One level deeper: {project: {nomProjet: ...}, data: {name: ...}}
    for (final wrapKey in ['project', 'data', 'item', 'content']) {
      final nested = j[wrapKey];
      if (nested is Map) {
        for (final key in ['nomProjet', 'name', 'title', 'projectName']) {
          final v = _str(nested[key]);
          if (v.isNotEmpty) return v;
        }
      }
    }
    return '';  // intentionally empty — card uses ?? 'Sans nom' itself
  }

  static String _resolveCurrentAction(Map<String, dynamic> j) {
    // Explicit action fields first
    for (final key in [
      'currentAction', 'action', 'pipelineStage', 'currentStage', 'phase',
    ]) {
      final v = _str(j[key]);
      if (v.isNotEmpty) return v;
    }
    // Fall back to last action type
    final lastAction = j['lastAction'];
    if (lastAction is Map) {
      final t = _str(
          lastAction['typeAction'] ?? lastAction['type'] ?? lastAction['action']);
      if (t.isNotEmpty) return t;
    }
    // Final fallback: statut
    return _str(j['statut'] ?? j['status']);
  }

  static OwnerModel? _resolveOwner(Map<String, dynamic> j) {
    // 1. Nested objects — Mongoose populate puts the full user doc here.
    for (final key in [
      'owner', 'user', 'createdBy', 'commercial',
      'assignedTo', 'creator', 'author', 'responsable', 'assignee',
    ]) {
      final val = j[key];
      if (val is Map) {
        final m = OwnerModel.fromJson(Map<String, dynamic>.from(val));
        if (!m.isEmpty) return m;
      }
    }

    // 2. Flat fields — mirroring ProjectGridData._resolveOwnerName exactly.
    final userNom       = _str(j['user_nom']);
    final userNomCustom = _str(j['user_nom_custom']);
    final ownerEmail    = _str(j['ownerName']); // "ownerName" = email in this API

    if (userNom.isNotEmpty) {
      final full = userNomCustom.isNotEmpty
          ? '$userNom ($userNomCustom)'
          : userNom;
      return OwnerModel(fullName: full, email: ownerEmail);
    }
    if (userNomCustom.isNotEmpty) {
      return OwnerModel(fullName: userNomCustom, email: ownerEmail);
    }
    if (ownerEmail.isNotEmpty) {
      return OwnerModel(fullName: ownerEmail, email: ownerEmail);
    }

    // 3. createdBy as plain string (skip if it looks like a raw MongoDB ID)
    final createdBy = _str(j['createdBy']);
    if (createdBy.isNotEmpty && !_looksLikeMongoId(createdBy)) {
      return OwnerModel(fullName: createdBy);
    }

    return null;
  }

  static bool _looksLikeMongoId(String s) =>
      s.length == 24 && RegExp(r'^[a-f0-9]+$').hasMatch(s);

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.replaceAll(',', '.'));
    return null;
  }
}
