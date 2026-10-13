# Power BI intégré — RLS V3 et préparation backend / Flutter (12/10/2026)

Suite de `POWERBI-EMBED-AUDIT.md`. **L'intégration n'est pas opérationnelle** : aucun rapport publié, aucune configuration Microsoft, aucun essai de bout en bout avec deux comptes dans Flutter. Ce qui existe : des rôles RLS vérifiés dans le modèle local, et du code préparé, désactivé, testé avec des doubles.

## 1. Fichiers

| Fichier | Nature |
|---|---|
| `Documents\PFE_CRM_BI_DEMO_V3\PFE_CRM.SemanticModel\definition\roles\Commercial.tmdl` | nouveau |
| `…\roles\Vue globale.tmdl` | nouveau |
| `…\definition\model.tmdl` | 2 lignes `ref role` ajoutées |
| `Documents\PFE_CRM_BI_DEMO_V3_avant_RLS\` | point de retour arrière (copie complète, 784 fichiers) |
| `Backend Master/src/modules/powerbi/powerbi.service.js` | nouveau |
| `Backend Master/src/modules/powerbi/powerbi.routes.js` | nouveau |
| `Backend Master/src/app.js` | 3 lignes : montage de `/powerbi` |
| `Backend Master/test/powerbi.embedConfig.test.js` | nouveau, 18 tests |
| `Dash Master Toolkit/lib/powerbi/` (5 fichiers) | nouveau : service, hôte (web + neutre), écran |
| `Dash Master Toolkit/test/powerbi/powerbi_embed_test.dart` | nouveau, 14 tests |

Non modifiés : mesures, relations, pages du rapport, `package.json`, `package-lock.json`, `pubspec.yaml`, `pubspec.lock`, `web/index.html`, routeur et menu Flutter, `.env`, original `PFE_CRM_BI_DEMO`, copie V2, second dépôt. Aucune dépendance installée : le backend utilise `axios` déjà présent, Flutter uniquement des bibliothèques du SDK.

## 2. Modèle — rôles ajoutés

```
role Commercial
	modelPermission: read
	tablePermission 'Dim Commercial' = 'Dim Commercial'[id] = USERPRINCIPALNAME()
	tablePermission 'public users' = 'public users'[id] = USERPRINCIPALNAME()
	tablePermission 'public clients' = FALSE()
	tablePermission 'public machines' = FALSE()
	tablePermission 'public production_fiches_v' = FALSE()
	tablePermission 'public recuperable_fiches' = FALSE()
	tablePermission 'public recuperable_lignes' = FALSE()

role 'Vue globale'
	modelPermission: read
```

L'identité attendue est l'UUID du compte. Clients, production, machines et déchets ne pouvant pas être restreints par commercial, ils sont **vidés** pour ce rôle : ce n'est pas un masquage d'affichage, les lignes ne sont pas lisibles.

## 3. Tests réellement exécutés

### Modèle (Desktop ouvert sur la V3, requêtes DAX en lecture seule)

| Test | Méthode | Résultat |
|---|---|---|
| Chargement des rôles | Desktop a ouvert la V3 ; le bouton affiche « Rôles (2) » | réussi |
| Rôle Commercial, identité sans correspondance | requête sous le rôle (identité = compte Windows) | tout vide : commerciaux, projets, contacts, relances, actions, **clients, machines, fiches de production, fiches et lignes de déchets** |
| Rôle Vue globale | requête sous le rôle | 10 commerciaux, 80 projets, 150 contacts, 209 relances, 450 actions, 60 clients, 9 machines, 160 fiches, 20 fiches déchets |
| Chemin de filtrage pour commercial01 | filtre équivalent (`TREATAS` sur `Dim Commercial[id]` et `public users[id]`) | 14 projets, 23 contacts, 33 relances, 68 actions, 1 utilisateur visible |

**Non exécuté : « Afficher comme » pour commercial01, commercial02 et l'administrateur.** Le moteur local refuse d'emprunter une identité qui n'est pas un compte Windows, et la boîte de dialogue « Voir comme » de Desktop n'est pas accessible à l'automatisation. Le test par compte reste donc à faire à la main (2 minutes) :

1. Ouvrir `PFE_CRM_DEMO_V3.pbip`, onglet Modélisation › **Voir comme**.
2. Cocher **Commercial** et **Autre utilisateur**, saisir l'UUID, OK.

| Compte | UUID | Attendu (page 02) |
|---|---|---|
| commercial01 | `ee815d2c-3a83-57fa-9570-76693b29bf69` | 14 projets, 23 contacts, 33 relances, 68 actions ; pages 05, 07, 08 vides |
| commercial02 | `68d9ded1-f1e5-566e-8a8e-e9e202e0066e` | 14 / 24 / 37 / 78 ; pages 05, 07, 08 vides |
| administrateur | rôle **Vue globale** seul | 80 / 150 / 209 / 450 ; toutes les pages remplies |
| sans correspondance | `00000000-0000-0000-0000-000000000000` | tout vide |

### Backend — `npx jest test/powerbi.embedConfig.test.js` : 18 réussis
Sans base ni réseau (modèle `User` et client HTTP simulés).

| Cas | Résultat |
|---|---|
| Désactivée par défaut, paramètre manquant, hors `DEMO_MODE` | 503, aucun appel à la base ni à Microsoft |
| commercial01, commercial02 | identité RLS = leur UUID, rôle `Commercial`, libellé « Utilisateur connecté : … », 4 pages autorisées |
| admin | rôle `Vue globale`, libellé « Vue globale — Administrateur » |
| UUID, e-mail ou rôle envoyés par le navigateur (URL, corps, en-têtes) | ignorés |
| Jeton portant « admin » sur un compte commercial en base | reste `Commercial` |
| commercial_sedentaire | rôle `Commercial` |
| responsable_logistique_achat, superadmin2 | 403, aucun appel Microsoft |
| Compte désactivé ou supprimé | 403 |
| Échec Microsoft | 502 générique, aucun secret dans la réponse ni les journaux |

### Flutter — `flutter test test/powerbi` : 14 réussis ; `flutter analyze lib/powerbi test/powerbi` : aucun problème
Service et hôte simulés : libellés par rôle, messages 401 / 403 / 503 / 502, changement de compte (contexte détruit puis rechargé), réponse tardive d'une session précédente ignorée, renouvellement du jeton sans rechargement, cible non web.

**Non testé** : l'hôte web réel (`powerbi_embed_host_web.dart`, chargement de la bibliothèque JavaScript et affichage du rapport). Il n'est référencé par aucun écran de l'application et ne peut être essayé sans rapport publié.

## 4. État d'activation

- Route `GET /powerbi/embed-config` : montée, mais répond 503 tant que `POWERBI_EMBED_ENABLED=true` et les six variables `POWERBI_*` ne sont pas définies, et tant que le backend n'est pas lancé par `npm run demo:start`.
- Écran Flutter : présent dans `lib/powerbi/`, **relié à aucune route ni menu**. Pour l'activer plus tard, une `GoRoute` vers `PowerBiEmbedScreen` suffira ; je ne l'ai pas ajoutée.

## 5. Limites

1. `commercial_sedentaire` : aucun contact ni projet ne leur est rattaché dans le modèle ; ils verront un rapport vide.
2. `superadmin2` (`issam@gmail.com`) : non cité dans vos décisions, donc refusé. À confirmer.
3. Les boutons de navigation du rapport restent visibles pour un commercial ; les pages Clients, Production et Machines s'ouvrent mais sont vides.
4. Pour un commercial, `Nombre Commerciaux` vaut 1 et les 22 contacts sans commercial sont invisibles.
5. Les libellés d'e-mail du rapport restent en `@demo.invalid` tant que le modèle n'est pas actualisé depuis la démo.
6. Un jeton d'intégration émis reste valable jusqu'à son expiration (15 minutes) même après déconnexion.
7. Desktop n'a pas ré-enregistré la V3 depuis l'ajout des rôles ; ils sont dans les fichiers TMDL et seront relus à l'ouverture.
8. Le backend lancé par `npm run dev` (base réelle) tournait encore pendant ce travail ; compteurs de la base réelle inchangés depuis le dernier relevé (13827 / 5838 / 4317).

## 6. Retour arrière

Power BI Desktop fermé sur la V3 :
```bash
rm -r "C:/Users/bhfha/Documents/PFE_CRM_BI_DEMO_V3/PFE_CRM.SemanticModel/definition/roles"
```
```bash
cp "C:/Users/bhfha/Documents/PFE_CRM_BI_DEMO_V3_avant_RLS/PFE_CRM.SemanticModel/definition/model.tmdl" "C:/Users/bhfha/Documents/PFE_CRM_BI_DEMO_V3/PFE_CRM.SemanticModel/definition/model.tmdl"
```
Backend et Flutter (depuis `source code`) :
```bash
rm -r "Backend Master/src/modules/powerbi" "Backend Master/test/powerbi.embedConfig.test.js" "Dash Master Toolkit/lib/powerbi" "Dash Master Toolkit/test/powerbi"
```
Puis retirer à la main les trois lignes `/powerbi` de `Backend Master/src/app.js` (le fichier contient d'autres changements locaux : ne pas utiliser `git checkout`).

## 7. Reste à faire, hors de ce périmètre

Publication du rapport, inscription Entra, capacité, variables `POWERBI_*`, branchement de l'écran dans le routeur, puis essai réel avec deux comptes commerciaux et un administrateur.
