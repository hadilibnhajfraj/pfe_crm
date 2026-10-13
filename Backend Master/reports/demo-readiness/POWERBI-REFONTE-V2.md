# Refonte Power BI — copie de travail V2 (12/10/2026)

## 1. État réel

| Élément | État |
|---|---|
| Rapport d'origine `Documents\PFE_CRM_BI_DEMO` (ouvert dans Desktop) | **Non modifié** : 605 fichiers, 0 différence d'empreinte avant/après |
| Copie de travail `Documents\PFE_CRM_BI_DEMO_V2\PFE_CRM_DEMO_V2.pbip` | **Fichiers réellement modifiés** (identité visuelle des 15 pages, textes de la page 06) |
| Rendu dans Power BI Desktop | **Non vu.** Aucun outil ne me permet de piloter Desktop : la copie n'a pas encore été ouverte |
| Captures de chaque page | **Non fournies.** Seuls des aperçus schématiques (positions, couleurs, textes ; ni graphiques ni valeurs) ont été produits pour contrôle ; ce ne sont pas des captures |
| Maquette « Executive Overview » citée comme référence | **Absente de cette conversation.** La refonte suit la charte écrite de la mission, pas une maquette |
| Mise en page (positions, tailles, visuels) | **Inchangée.** Les pages avaient déjà été restructurées (voir `RAPPORT_REFONTE_PAGES.md`) et leur contenu correspond aux listes de la mission ; aucun visuel ajouté, déplacé ou supprimé |
| Modèle sémantique, mesures DAX, relations | Identiques à l'origine (empreinte égale) |
| Base de production `cbigestionnairepfe` | Non touchée : compteurs d'écriture 13827 / 5837 / 4317 inchangés, 0 session |
| Actualisation des données | Aucune déclenchée |

## 2. Inventaire des modifications (copie V2 uniquement)

Appliquées par script sur 495 fichiers de visuels, 15 `page.json` et le thème.

- **Palette** : bleu marine `#0B2545` (titres, navigation), bleu roi `#2563EB` (KPI principaux, page active), turquoise `#14B8A6` (KPI complémentaires), orange `#F97316` (relances, alertes, bandeau), rouge `#DC2626` (critique), fond `#F3F6FB`, cartes blanches.
- **Navigation latérale** : fond marine, texte clair ; 12 boutons « page active » en bleu roi, 111 boutons inactifs avec survol. Cibles de navigation inchangées.
- **Cartes** : 112 ombres discrètes ajoutées (graphiques, tableaux, tuiles KPI) ; bordures fines conservées.
- **Barres d'accent des KPI**, selon la mesure affichée : 26 bleu roi (volumes : clients, contacts, projets, actions, fiches, machines), 14 turquoise (réalisé, validé, gagné, actif, taux de conversion), 14 orange (relances, à venir, planifié, annulé, déchets), 7 rouge (en retard, perdus, non conformes, stagnants, sans activité).
- **Thème** : `CRM_Light_Executive.json` (même nom de fichier), couleurs de séries alignées sur la palette.
- **Bandeau « Données de démonstration »** : conservé sur toutes les pages.
- **Page 06 — AI Business Copilot** : 12 blocs de texte réécrits. L'ancien contenu décrivait une « architecture d'intégration Claude (à implémenter) » et des questions non vérifiées. Le nouveau indique que le Copilot s'utilise dans le CRM, que le rapport ne l'exécute pas, liste 7 questions réellement testées le 12/10/2026 et le fonctionnement réel (Ollama `qwen3:8b`, 85 outils, contrôle d'accès serveur). Aucune statistique d'usage, aucune réponse simulée.

Contrôle automatique après modification : 537 visuels comparés, 11 écarts = les textes voulus de la page 06 ; 558 JSON lisibles ; **0** requête, filtre, interaction, synchronisation de segment ou position modifié.

## 3. Mesures vérifiées (DAX en lecture seule sur le modèle ouvert, comparées aux références SQL)

| Domaine | Valeurs |
|---|---|
| Volumes | Clients 60 · Contacts 150 · Projets 80 · Actions 450 · Commerciaux 10 (voir anomalie A2) |
| Pipeline | Actifs 80 · Gagnés 14 · Perdus 5 · Taux de conversion 17,5 % · Sans activité récente 57 · Stagnants 25 |
| Relances | Total 209 = réalisées 145 + à venir 3 + en retard 46 + annulées 15 · planifiées 49 · contacts 100 / projets 109 |
| Production | Fiches 160 (PROMESH 90 + PROBAR 70) · validées 115 · non conformes 13 · 125 600 m² · quantité PROBAR 100 140 |
| Machines et déchets | Machines 9, actives 9 · Fiches déchets 20 · 1 781,7 kg · produit fini 545,8 kg |
| Contrôles | Hors lot TEST 0 · Écart gagnés 0 · Date de référence 30/09/2026 · cumulés clients 60, contacts 150 |

Toutes cohérentes avec la base de démonstration.

**Interactions, filtres, navigation** : non testés à l'écran. Leur définition est identique à l'origine (0 écart) ; leur comportement reste à constater dans Desktop.

## 4. Anomalies restantes (décisions à prendre, rien n'a été corrigé)

| # | Constat | Effet |
|---|---|---|
| A1 | `Dim Commercial[Profil Commercial]` étiquette les 6 comptes `commercial` comme « Commercial sédentaire » ; les 2 vrais `commercial_sedentaire` sont en « Aucune activité » | Le segment « Type de commercial » est trompeur. Correction = colonne calculée du modèle, donc hors périmètre « préserver le modèle » sans votre accord |
| A2 | `Nombre Commerciaux` = 10 : compte aussi l'admin et le compte production (attendu : 6 + 2) | KPI surévalué sur la page 02 |
| A3 | 22 contacts sans commercial | Ligne vide dans les répartitions par commercial |
| A4 | Seuils « Stagnants » (90 j) et « Sans activité » (30 j) marqués « à valider » dans les mesures | À confirmer ou à annoncer comme hypothèse |
| A5 | Mesures DAX de couleur conditionnelle non modifiées : elles renvoient encore l'ancien vert / ambre | Quelques éléments conditionnels peuvent ne pas suivre la nouvelle palette |
| A6 | Pas de KPI « relances du jour » ; la date de référence est figée au 30/09/2026 | Non ajouté : aurait demandé une nouvelle mesure |
| A7 | Les propriétés d'ombre ont été écrites dans les fichiers sans validation par Desktop | Si Desktop signale une erreur à l'ouverture ou si les ombres n'apparaissent pas, me le dire : elles se retirent par script sans toucher au reste |

## 5. Étapes pour vous

1. Laisser l'original tel quel. Ouvrir `Documents\PFE_CRM_BI_DEMO_V2\PFE_CRM_DEMO_V2.pbip` dans Power BI Desktop.
2. Ne pas actualiser, ou vérifier d'abord que `PG_Database` vaut `cbigestionnairepfe_demo` (c'est le cas dans la copie).
3. Parcourir les 9 pages visibles en « Ajuster à la page » : lisibilité de la navigation, ombres, couleurs des KPI, bandeau.
4. Tester : segments Année / Mois / Commercial, bouton « Réinitialiser les filtres », filtrage croisé, extraction vers les pages de détail, info-bulles.
5. Faire les captures (Fichier › Exporter › PDF, ou capture d'écran par page).
6. Si le rendu convient et que vous voulez remplacer l'original : fermer Desktop d'abord, puis me le demander.
