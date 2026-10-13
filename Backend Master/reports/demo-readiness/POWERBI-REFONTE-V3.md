# Refonte Power BI — composition unifiée, copie V3 (12/10/2026)

Remplace `POWERBI-REFONTE-V2.md` (la V2 ne changeait que les couleurs).

## 1. Fichiers

| Fichier | État |
|---|---|
| `Documents\PFE_CRM_BI_DEMO` (original, ouvert dans Desktop) | Non modifié : 605 fichiers, 0 différence d'empreinte |
| `Documents\PFE_CRM_BI_DEMO_V2` (ouvert et enregistré par vous à 15 h 01) | Non modifié par moi : il était ouvert dans Desktop, je ne l'ai que lu |
| **`Documents\PFE_CRM_BI_DEMO_V3\PFE_CRM_DEMO_V3.pbip`** | **Copie de la V2 enregistrée, recomposée.** C'est le livrable |
| Captures réelles | `reports/demo-readiness/powerbi-v3-captures/` : `01` à `09` = pages visibles, `10` à `12` = pages de détail, `01b` `03b` `04b` = bas des pages longues |

Les captures sont prises dans Power BI Desktop (instance ouverte sur la V3), pas des maquettes.

## 2. Ce qui a été recomposé sur les 12 pages (hors info-bulles)

| Zone | Avant | Après (d'après la maquette « Vue exécutive ») |
|---|---|---|
| Navigation | 220 px, libellés numérotés, deux tailles de boutons | 208 px bleu nuit, 9 boutons identiques avec icône, page active en bleu roi, date de référence en carte |
| En-tête | Titre en capitales + bandeau orange pleine largeur | Titre 20 pt + sous-titre court, pastille ambre « Données simulées », carte du contexte de filtres |
| Filtres | Segments isolés, chacun dans son cadre ; réinitialisation dans la barre latérale | Une seule barre blanche ; bouton « Réinitialiser les filtres » à droite de la barre |
| KPI | Tuile + barre de couleur de 4 px | Tuile blanche, pastille icône teintée, valeur, libellé sur deux lignes si besoin |
| Graphiques | Grilles différentes selon les pages | Grille commune : marges 12 px, rayon 12, deux rangées de 231 px, titres 12 pt |
| Tableaux | En-tête bleu marine, colonnes tronquées | En-tête clair, 9 pt ; tableaux à e-mails placés en pleine largeur |
| Couleurs | Orange sur les relances et plusieurs séries | Orange retiré des séries. Rouge = en retard, perdus, non conformes, stagnants. Orange = déchets uniquement |

Éléments de la maquette **non repris, volontairement** : pourcentages d'évolution (+12 %…), mini-courbes, « Relances aujourd'hui », valeurs 18 / 12 / 34, slogan PROBAR, logo. Aucune mesure du modèle ne les fournit ; les afficher aurait été inventer des données.

## 3. Page 04 — Relance Center

1. En-tête compact identique aux autres pages.
2. Année, Mois, Commercial, Type de commercial dans la barre unique.
3. Six KPI : Total (bleu), Réalisées (turquoise), Planifiées (marine), À venir (bleu ciel), En retard (rouge), Annulées (gris).
4. Rangée 1 : Relances par mois · Relances par statut · Relances à traiter. Rangée 2 : par commercial · par client.
5. « Relances par statut » passe de barres fines à un anneau (mêmes quatre mesures). « Par commercial » est élargi : e-mails lisibles en entier.
6. Les deux tableaux sont en pleine largeur sous la ligne de flottaison : plus de défilement horizontal. La page fait 1232 px de haut, affichée « Ajuster à la largeur ».
7. Zone « Relances à traiter » : En retard 46, À venir 3, Planifiées 49, sur les mesures existantes (`Planifiées = En retard + À venir` dans le modèle).
8. L'orange a disparu de la page ; seul « En retard » est en rouge.

## 4. Autres pages

| Page | Changements propres |
|---|---|
| 01 Executive Overview | Ajout de « Relances à traiter » ; rangée 2 à trois graphiques ; statuts des fiches et deux tableaux sous la ligne de flottaison (page 1196 px) |
| 02 Commercial Performance | Activité par commercial élargie, tableau de détail à 732 px |
| 03 Project Pipeline | Trois graphiques puis deux ; tableau de détail pleine largeur sous la ligne de flottaison (page 1008 px) |
| 05 Clients & Contacts | Grille 3 + 3 rééquilibrée |
| 06 AI Business Copilot | Panneau à gauche, six tuiles KPI à droite, questions sur deux colonnes égales |
| 07 Production | Tableau élargi (plus de défilement horizontal) |
| 08 Machines & Déchets | Quatre graphiques en rangée 1, tableau des machines à 692 px |
| À lire | Blocs de texte en cartes, trois contrôles en tuiles KPI ; bouton de réinitialisation retiré (aucun segment sur cette page) |
| Détails (3 pages masquées) | Même en-tête, carte de titre à la place de la barre de filtres |

## 5. Contrôles

- 510 visuels conservés : requête, filtres, groupes de synchronisation, liens de navigation, info-bulles identiques à la V2 ; 0 écart.
- Interactions entre visuels, filtres et visibilité des pages : 0 écart.
- Modèle sémantique : identique à l'original (mesures DAX, relations, paramètres `PG_Database = cbigestionnairepfe_demo`).
- 205 visuels ajoutés : fonds, icônes, libellés, plus 6 cartes sur des mesures existantes (zone « Relances à traiter », pages 01 et 04).
- 27 visuels retirés : 26 zones de texte décoratives (traits, libellé « NAVIGATION ») et le bouton sans effet de la page « À lire ». Aucun ne portait de requête.
- Aucune actualisation de données déclenchée.
- Non testé à la main : clic sur les segments, filtrage croisé, extraction vers les pages de détail. Leur définition est inchangée, leur comportement reste à constater.

## 6. Défauts visibles restants

- Trois pages (01, 03, 04) dépassent l'écran : il faut faire défiler pour voir les tableaux.
- Page 01, sept KPI : libellés en 8 pt sur deux lignes.
- « Projets par étape » (01, 03) garde une barre de défilement verticale : il y a plus d'étapes que de place.
- « Activité par commercial » (02) : trois séries pour sept commerciaux, barres fines.
- Les anomalies de données de `POWERBI-REFONTE-V2.md` (§ 4, A1 à A6) sont inchangées.

## 7. Base de production — à traiter de votre côté

Le backend tourne depuis 14 h 51 avec `npm run dev` (processus `nodemon src/app.js`), donc sur la base réelle `cbigestionnairepfe` définie par `.env`, pas sur la démo. Effet mesuré depuis le matin : 0 insertion, 0 suppression, **+1 mise à jour** (5837 → 5838), et des rafales de 10 connexions. Ce n'est pas le travail Power BI : mes requêtes SQL passent par une session en lecture seule sur `cbigestionnairepfe_demo`, et le rapport pointe sur la démo. Je n'ai pas arrêté ce processus. Pour la démonstration : l'arrêter et relancer avec `npm run demo:start`.

## 8. Pour adopter la V3

1. Fermer les deux autres fenêtres Desktop si la mémoire manque (0,7 Go libre pendant le travail).
2. Ouvrir `PFE_CRM_DEMO_V3.pbip`, sans actualiser.
3. Tester segments, réinitialisation, filtrage croisé, extraction vers les détails.
4. Si elle convient, me demander de remplacer l'original (Desktop fermé).
