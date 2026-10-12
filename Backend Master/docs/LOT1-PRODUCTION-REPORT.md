# Lot applicatif 1 — Production : rapport

Réalisé le 10/10/2026. **Rien n'est déployé.** Aucune donnée modifiée, aucune migration touchée, aucun index créé, aucune permission ni aucun statut historique changé.

## 1. Ce qui change pour l'utilisateur

| Point | Avant | Après |
|---|---|---|
| A — Fiche existante | Aucune information : la fiche était créée (PROMESH) ou un brouillon rouvert d'office (PROBAR) | Un avertissement liste les fiches du même jour, de la même machine et du même poste. La création reste toujours possible |
| B — Brouillon vide | Jamais proposé (PROMESH) ; reprise automatique de tout brouillon du jour (PROBAR) | L'application **propose** de reprendre le brouillon ; l'utilisateur choisit. Rien n'est fusionné, écrasé ni supprimé |
| C — Heures | Aucun contrôle : 9 fiches validées sur 10 avaient une fin ≤ début | À la validation seulement : fin ≠ début ; fin < début accepté uniquement au poste de nuit ; date pas dans le futur |
| D — Date après minuit | Une fiche PROMESH créée entre minuit et 1 h était datée de la veille | Date et heure viennent du même instant, dans le fuseau `Africa/Tunis` |

L'avertissement propose trois choix : **Annuler**, **Reprendre le brouillon**, **Créer une nouvelle fiche**.

## 2. Audit du code (phase 1)

| Sujet | Constat |
|---|---|
| Création PROMESH | `POST /por-promesh/new` → `createOrOpenDraft`, qui crée toujours une fiche. Chemins alternatifs : `POST /por-promesh` et l'outil Copilot `create_or_open_por_promesh_draft`, qui appelle le même service |
| Création PROBAR | L'application cherchait un brouillon du jour (même machine, même poste), le rouvrait automatiquement, sinon `POST /industrial-records` |
| Machine, date, poste | Machine et poste viennent de l'écran. Date PROMESH calculée par le serveur ; date PROBAR calculée par l'application |
| Validation PROMESH | `POST /:id/validate` exigeait seulement que date et heures soient renseignées |
| Validation PROBAR | `PUT` avec `statut = validee` : date, machine, poste, quantité et contenu exigés ; heures non exigées, stockées dans le texte JSON `description` (`hd`, `hf`) |
| Cause du décalage de date | `toISOString()` (heure universelle) pour la date, `toTimeString()` (heure locale) pour l'heure de début |
| Horaires de poste | **Aucune définition**, ni dans le backend ni dans l'application |
| Tests existants | 8 fichiers, 133 tests, aucun sur la création, les doublons ou les heures |

## 3. Règles métier absentes, à confirmer

Elles ne sont écrites nulle part. J'ai retenu le minimum et tout regroupé dans un seul fichier, `src/modules/production/services/ficheRules.js`, pour les ajuster facilement.

1. **Horaires des postes : inconnus.** Je n'en ai supposé aucun. La seule règle retenue est qu'un poste `nuit` peut finir le lendemain et qu'un poste `matin` ne le peut pas (constante `POSTES_CROSSING_MIDNIGHT`).
2. **Libellé du poste `nuit`** : affiché « Soir » sur certains écrans et « Nuit » sur d'autres. Si ce poste est en réalité un poste du soir qui ne passe pas minuit, la règle ci-dessus est à revoir. Non modifié.
3. **Date d'une fiche créée après minuit pendant un poste de nuit** : j'ai retenu le jour calendaire de la création, cohérent avec l'heure de début et avec ce que fait déjà l'application pour PROBAR. L'autre convention possible (date du début du poste) demande les horaires des postes.
4. **Durée maximale d'une fiche** : aucune limite posée.
5. **Heures obligatoires pour PROBAR** : non. Une fiche PROBAR reste validable sans heures, comme avant ; elles ne sont contrôlées que si elles sont saisies.

## 4. Implémentation

### Backend

| Fichier | Changement |
|---|---|
| `src/modules/production/services/ficheRules.js` | **nouveau** — date et heure en fuseau métier, contrôle des heures, durée, détection d'une valeur vide |
| `src/modules/por-promesh/services/porPromesh.service.js` | `findExistingFiches`, `isEmptyDraft` ; date de création corrigée ; contrôle des heures dans `validatePorPromesh` |
| `src/modules/por-promesh/controllers/porPromesh.controller.js`, `routes/porPromesh.routes.js` | nouvelle route `GET /por-promesh/existing` |
| `src/modules/industrial-records/services/industrialRecord.service.js` | `findExistingFiches`, `isEmptyProbarDraft` ; contrôle des heures au passage à `validee` (PROBAR seulement) |
| `src/modules/industrial-records/controllers/…`, `routes/…` | nouvelle route `GET /industrial-records/existing` |

**Deux routes ajoutées, en lecture seule** : `GET /por-promesh/existing?machine=&poste=&date=` et `GET /industrial-records/existing?machine=&poste=&date=`. Mêmes rôles et même périmètre que les listes existantes (`responsable_logistique_achat` ne voit que ses fiches). Réponse : `{ machine, poste, date, count, emptyDraftId, fiches: [...] }`.

**Brouillon « réellement vide »** : fiche non validée où l'opérateur n'a rien saisi — aucune quantité, conformité, observation ni autre champ ; heure de fin jamais modifiée ; aucune ligne de contrôle, d'arrêt ou de consommation renseignée ; aucune pièce jointe. Les lignes pré-remplies par l'application (heures de contrôle, paramètres générés) ne comptent pas comme une saisie.

### Application Flutter

| Fichier | Changement |
|---|---|
| `lib/forms/production/view/widgets/existing_fiches_dialog.dart` | **nouveau** — modèle et fenêtre d'avertissement, communs aux deux lignes |
| `lib/forms/por_promesh/service/por_promesh_service.dart` | `fetchExisting` |
| `lib/forms/por_promesh/view/poste_dashboard_screen.dart` | vérification puis avertissement avant `POST /por-promesh/new` |
| `lib/forms/industrial/service/industrial_record_service.dart` | `fetchExistingProbar` ; le message d'un refus du serveur (400) est maintenant affiché tel quel |
| `lib/forms/industrial/view/probar/probar_poste_dashboard_screen.dart` | la reprise automatique d'un brouillon devient une proposition |
| `assets/lang/fr.json`, `en.json`, `ru.json` | 8 libellés ajoutés |

Si la vérification des fiches existantes échoue (réseau, serveur), la création se déroule comme avant : elle n'est jamais bloquée par ce contrôle.

## 5. Compatibilité

| Élément | État |
|---|---|
| Routes existantes | aucune supprimée, aucune réponse modifiée ; `POST /por-promesh/new` rend exactement la même forme |
| Outil Copilot de création | inchangé : il crée une fiche comme avant, avec la date corrigée |
| Outils Copilot de validation | reçoivent maintenant un refus explicite (400) si les heures sont incohérentes |
| Permissions, statuts, énumérations | inchangés |
| Migrations M1 à M8, base de données | non touchées ; aucun index ajouté |
| Fiches existantes | non modifiées ; le contrôle des heures ne s'applique qu'à une **nouvelle** validation |

**Changement de comportement à connaître** : un brouillon PROMESH naît avec heure de fin = heure de début. Il ne peut plus être validé sans que l'heure de fin soit saisie. C'est l'effet voulu de la règle C ; le serveur renvoie un message clair, que l'application affiche.

## 6. Tests

### Avant / après

| Passe | Fichiers | Tests réussis | En échec |
|---|---|---|---|
| Tests ciblés, **avant** le lot | 8 | 133 | 0 |
| Tests ciblés, **après** le lot (8 anciens + 2 nouveaux) | 10 | 231 | 0 |
| Suite complète, référence du 08/10 | 254 | 7 528 | 34 |
| Suite complète, **après** le lot | 256 | 7 626 | 34 |

**Aucun nouvel échec.** Les 34 tests en échec sont les mêmes, dans les 6 mêmes fichiers qu'avant le lot : `mfa`, `mfa.dedup`, `nfr.dataIntegrity`, `ai.orchestrator.porPromeshAgent.integration`, `dashboard.service.getUserKPIs`, `notification.service.dbRegression`. Aucun ne concerne ce lot.

### Tests ajoutés (98)

- `test/production.ficheRules.test.js` — 30 tests unitaires : date autour de minuit, fin de mois, fin d'année, 29 février, indépendance du fuseau du serveur ; heures au poste du matin, au poste de nuit, passage à minuit, fin = début, date future, date limite à 00 h 30 ; heures facultatives ; durée.
- `test/production.ficheCreation.test.js` — 66 tests d'intégration sur les routes réelles (dépôts simulés) : accès par rôle, paramètres, fiches multiples légitimes, brouillon vide (13 cas PROMESH, 7 cas PROBAR), création à 23 h 59, 00 h 04, 00 h 59 et 01 h 00, validation normale et refusée, enregistrement d'un brouillon jamais bloqué, fiche déjà verrouillée, fiches de mélange non concernées.
- `test/nfr.production.test.js` — 2 tests ajoutés.

**Un test existant adapté** : `nfr.production.test.js` validait un brouillon PROMESH sans jamais saisir d'heure de fin. C'est précisément ce que la règle C interdit désormais. Le test vérifie maintenant que cette validation est refusée, saisit les heures d'un poste de nuit, puis valide.

### Application

- `flutter build web` : réussi (162 s).
- Analyse statique des 5 fichiers Dart modifiés : aucune erreur ni alerte nouvelle ; 12 remarques de dépréciation préexistantes (`withOpacity`).
- **Non fait** : l'avertissement n'a pas été essayé à l'écran dans un navigateur. Son comportement repose sur la compilation, l'analyse statique et les tests des routes qu'il appelle.

## 7. Contrôle du diff

18 fichiers modifiés ou créés depuis le début du lot, tous dans le périmètre Production :

- backend : 6 fichiers modifiés, 1 créé ;
- tests : 1 modifié, 2 créés ;
- Flutter : 4 fichiers modifiés, 1 créé ;
- traductions : 3 fichiers, 8 libellés chacun.

Les 8 fichiers de migration portent toujours leur date du 08/10. Aucun fichier des modules maintenance, RH ou documents n'a été touché.

À noter : le dépôt contenait déjà de nombreux fichiers modifiés et non validés avant ce lot (travaux antérieurs sur le Copilot et le module Production). Ils ne font pas partie de ce lot ; la liste ci-dessus est établie sur les dates de modification.

## 8. Anomalies vues et laissées en l'état (hors des corrections demandées)

1. **Statistiques PROMESH décalées d'un jour** : `getStats` (courbe des 7 derniers jours) regroupe les fiches par jour en heure universelle, même cause que le point D. Non corrigé : ce n'est pas la création d'une fiche.
2. **Reprise silencieuse d'un brouillon de session (PROMESH)** : si l'utilisateur a déjà un brouillon ouvert dans sa session pour la même machine et le même poste, « Nouvelle fiche » le rouvre sans avertissement. Comportement existant, conservé.
3. **Traces de diagnostic** (`console.log`) dans `porPromesh.service.js`, marquées « à retirer » par leur auteur. Non touchées.
4. **Poste sans rapport avec l'heure** : rien n'empêche de créer une fiche « matin » à 22 h. Sans horaires de poste, aucun contrôle n'est possible.

## 9. Avant tout déploiement

1. Confirmer les règles du § 3, en particulier ce que désigne le poste `nuit` / « Soir ».
2. Essayer l'avertissement à l'écran sur les deux lignes.
3. Livrer backend et application ensemble : l'application appelle les deux nouvelles routes. Si seul le backend est livré, rien ne change à l'écran ; si seule l'application est livrée, la vérification échoue et la création se fait comme avant.
