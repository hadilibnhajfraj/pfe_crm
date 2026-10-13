# Parcours de démonstration du Copilot — soutenance du 16/10/2026

Trois parcours, un par rôle. **Seul le parcours « commercial » a été joué en réel** : les comptes sédentaire et administrateur n'ont pas de mot de passe utilisable tant que la réinitialisation n'est pas autorisée. Pour ces deux rôles, le routage de chaque question a été vérifié, mais pas la réponse.

## Avant de commencer

1. Backend : `npm run demo:start` dans `Backend Master`. Attendre `[demo-guard] Base vérifiée : cbigestionnairepfe_demo`.
2. **Redémarrer le backend s'il tournait avant 13:00 le 12/10** : les corrections du routage « relance » et du compteur « Projets critiques » ne sont actives qu'après redémarrage.
3. Frontend : `flutter run -d chrome --web-port 57745`.
4. Ne pas redémarrer le backend entre la préparation et la démonstration si l'historique des conversations doit être montré : il est gardé en mémoire.
5. Utiliser les suggestions ou les questions ci-dessous telles quelles. Une question libre qui ne correspond à aucun agent passe par le modèle seul : 35 à 160 secondes sur cette machine.

## Parcours 1 — commercial (`demo.commercial01@cbi_tunisia.com`) — vérifié en réel

Message à faire passer : le Copilot répond avec les données du commercial connecté, et seulement les siennes.

| # | Action | Outil exécuté | Délai mesuré | Résultat attendu |
|---|---|---|---|---|
| 1 | Ouvrir le Copilot, onglet Tableau de bord | — | immédiat | « Projets critiques » : **5** ; cinq cartes de risque, toutes sur ses projets, la première : DEMO Projet 043 — Résidentiel |
| 2 | « Combien de projets sont enregistrés dans le CRM ? » | `list_projects` | 0,04 à 0,4 s | 14 projets, « votre périmètre d'accès » |
| 3 | « Analyse le pipeline commercial. » (suggestion) | `get_project_statistics` | 0,02 s | Tableau : Prospect 3, Actif 2, Contacté 2, Devis envoyé 2, Négociation 2, Gagné 1, Plan technique 1, Raté 1 ; total 14 |
| 4 | « Quels projets nécessitent une relance ? » | `list_projects` | 0,2 à 4,6 s | 14 projets « sans relance depuis plus de 30 jours (ou jamais relancés) » |
| 5 | « Quels dossiers nécessitent une attention particulière ? » | `list_projects`, `generate_recommendations` | 4,3 s | Priorités, tâches importantes, projets critiques ; DEMO Projet 043 en tête |
| 6 | « Résume l'activité commerciale… » (suggestion) | `get_my_commercial_contacts` | 0,3 s | 32 contacts : OK 14, injoignable 8, à rappeler 5, refus 5 |
| 7 | « Combien de fiches de production par machine ? » | `get_industrial_statistics` refusé | 0,01 s | « Votre rôle ne permet pas de consulter ces statistiques » — montre le contrôle d'accès côté serveur |
| 8 | « Que peux-tu faire ? » (suggestion) | aucun (agent d'audit des capacités) | 0,02 s | Liste de ce que le rôle commercial peut et ne peut pas faire |

Vérification : les chiffres des étapes 2, 3 et 6 correspondent au SQL de la base de démonstration.

À dire si le jury relève l'étape 4 : les 14 projets apparaissent tous « jamais relancés » parce que le champ `lastRelanceAt` n'est pas renseigné dans le lot simulé.

**À éviter avec ce rôle** : « Combien de projets par famille de produit ? » — 147 secondes et une réponse fausse (« 2 projets PROBAR » alors qu'il en a 9). La question n'atteint pas l'outil de statistiques et le modèle invente ses paramètres.

## Parcours 2 — commercial sédentaire (`demo.commercial_sedentaire01@cbi_tunisia.com`) — préparé, non joué

Message à faire passer : le sédentaire crée et affecte les contacts ; il a accès aux statistiques de contacts que le commercial terrain n'a pas.

| # | Question | Outil attendu | Ce qui a été vérifié | Valeur de référence (SQL) |
|---|---|---|---|---|
| 1 | Onglet Tableau de bord | — | Règle de périmètre testée : rôle non administrateur, limité à ses projets | 0 projet critique attendu : ce compte ne possède aucun projet |
| 2 | « Analyse mes contacts commerciaux. » | `get_my_commercial_contacts` | Routage et outil vérifiés avec le rôle commercial ; outil ouvert au sédentaire | 53 contacts créés par ce compte |
| 3 | « Quels contacts n'ont aucune relance ? » | `get_commercial_contact_statistics` | Routage vérifié ; outil refusé au commercial, ouvert au sédentaire | Périmètre : ses contacts sans relance (requête ci-dessous) |
| 4 | « Combien de contacts par statut ? » | `get_my_commercial_contacts` | Routage vérifié avec le rôle commercial | Répartition de ses 53 contacts |
| 5 | « Quels clients dois-je relancer cette semaine ? » | `get_my_commercial_contacts` | Routage vérifié (inchangé par la correction) | Ses contacts « à rappeler plus tard » |
| 6 | « Combien de fiches de production par machine ? » | refus | Outil réservé à l'administration et à la production | Message de refus |

Requête de référence pour l'étape 3 :

```sql
SELECT count(*) FROM commercial_contacts c
JOIN users u ON u.id = c."createdBy"
WHERE u.email = 'demo.commercial_sedentaire01@cbi_tunisia.com'
  AND NOT EXISTS (SELECT 1 FROM commercial_contact_relances r WHERE r."commercialContactId" = c.id);
```

## Parcours 3 — administrateur (`demo.admin01@cbi_tunisia.com`) — préparé, non joué

Message à faire passer : l'administrateur a la vue d'ensemble ; les mêmes questions donnent des totaux globaux.

| # | Question | Outil attendu | Ce qui a été vérifié | Valeur de référence (SQL) |
|---|---|---|---|---|
| 1 | Onglet Tableau de bord | — | Règle testée : un rôle administrateur garde la vue transverse | « Projets critiques » : **29** sur 80 projets |
| 2 | « Combien de projets sont enregistrés dans le CRM ? » | `list_projects` | Outil et règle de périmètre vérifiés | 80 |
| 3 | « Combien de projets par commercial ? » | `get_project_statistics` | Routage et outil vérifiés avec le rôle commercial | Commercial 01 : 14, 02 : 14, 03 à 06 : 13 chacun |
| 4 | « Combien de projets par statut ? » | `get_project_statistics` | idem | Prospect 20, Gagné 13, Devis envoyé 9, Contacté 7, Actif 5, Négociation 5, Offre 5, Perdu 4… total 80 |
| 5 | « Quels contacts n'ont aucune relance ? » | `get_commercial_contact_statistics` | Routage vérifié ; outil ouvert à l'administrateur | 79 contacts sur 150 |
| 6 | « Combien de fiches de production par machine ? » | `get_industrial_statistics` | Routage vérifié ; outil refusé au commercial, ouvert à l'administrateur | PROBAR seulement : PROBAR-05 19, PROBAR-02 15, PROBAR-03 15, PROBAR-04 12, PROBAR-01 9 ; total 70 fiches |
| 7 | « Quels projets sont critiques ? » | `list_projects`, `analyze_project_attention` | Outils vérifiés avec le rôle commercial | Classement sur les 80 projets |

Contraste à montrer : l'étape 1 du commercial affiche 5 projets critiques, celle de l'administrateur 29. Même règle de calcul, périmètres différents.

L'étape 6 ne couvre que les fiches PROBAR : les fiches PROMESH (90 fiches, 125 600 m²) passent par d'autres outils.

## Ce qu'il faut pour jouer les parcours 2 et 3

1. Votre autorisation de réinitialiser les neuf mots de passe (`npm run demo:passwords`, simulation par défaut).
2. Une répétition des deux parcours, pour relever les délais et confirmer les valeurs.
