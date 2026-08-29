# Comment créer une intervention (demande de maintenance) dans le CRM

## Objectif de l'écran

La boîte de dialogue **"Nouvelle demande de maintenance"** permet de signaler une panne ou un problème sur un équipement de production, pour qu'un technicien puisse intervenir. C'est un formulaire court, en une seule fenêtre (pas un assistant en plusieurs étapes).

## Champs de l'écran

| Champ | Obligatoire ? | Explication |
|---|---|---|
| Équipement | Non (une valeur par défaut est présélectionnée) | Liste déroulante : PROMESH — Machine 1 à 4, PROBAR — Machine 1 à 4, Mélangeur, Autre équipement. |
| Type de panne | **Oui** | Texte libre. Exemple suggéré à l'écran : "bruit anormal, arrêt moteur...". Message d'erreur si vide : *"Champ obligatoire"*. |
| Urgence | Non (par défaut "Moyenne") | Trois choix sous forme de bouton : **Faible** (vert), **Moyenne** (orange), **Critique** (rouge). |
| Description | Non | Texte libre, plusieurs lignes. Exemple suggéré : "Détaillez le problème rencontré...". |
| Photos | Non, maximum 5 | Formats acceptés : JPG, PNG uniquement. Chaque photo ajoutée apparaît sous forme d'étiquette supprimable. |

## Boutons de l'écran

| Bouton | Effet |
|---|---|
| **Annuler** | Ferme la boîte de dialogue sans rien enregistrer. |
| **Envoyer** | Valide et envoie la demande de maintenance (affiche "Envoi..." pendant l'envoi). |

## Étape par étape

1. Ouvrez "Nouvelle demande de maintenance" (accessible depuis le module Maintenance).
2. Choisissez l'**Équipement** concerné dans la liste.
3. Décrivez le **Type de panne** (obligatoire).
4. Sélectionnez le niveau d'**Urgence** (Faible / Moyenne / Critique).
5. Ajoutez une **Description** détaillée si besoin.
6. Ajoutez jusqu'à 5 **Photos** de la panne si utile.
7. Cliquez sur **Envoyer**.

## Ce qui se passe ensuite (workflow)

Une fois envoyée, la demande passe par les statuts suivants : **en attente** → un responsable maintenance l'**accepte** ou la **refuse** → si acceptée, elle passe **en cours** une fois qu'un technicien est affecté et démarre l'intervention → puis **terminée** une fois l'intervention achevée. Seuls les rôles admin/superadmin/responsable logistique-achat (ou le contact maintenance désigné) peuvent accepter, refuser, affecter un technicien ou clôturer une demande — un utilisateur standard peut créer une demande et suivre les siennes, mais pas les traiter.

## Actions possibles

Consulter la liste de ses propres demandes de maintenance, ajouter un commentaire sur une demande existante, consulter l'historique complet d'une demande (créée, acceptée/refusée, démarrée, terminée).

## Erreurs possibles

| Message affiché | Cause | Solution |
|---|---|---|
| "Champ obligatoire" | Le champ "Type de panne" est vide. | Décrivez le type de panne avant d'envoyer. |
| "equipement et typePanne sont requis" (erreur serveur) | Cas rare où l'équipement ou le type de panne arrive vide côté serveur. | Vérifiez que l'équipement est bien sélectionné et que le type de panne n'est pas vide. |

## Bonnes pratiques

- Choisissez le niveau d'**Urgence** avec soin : "Critique" doit être réservé aux pannes qui bloquent réellement la production — un mauvais classement retarde le traitement des vraies urgences par l'équipe maintenance.
- Une **description précise** ("bruit anormal côté moteur, arrêt à 14h30") permet au technicien de préparer l'intervention avant même de se déplacer.
- Ajoutez une **photo** dès que possible : elle accélère souvent le diagnostic à distance.
