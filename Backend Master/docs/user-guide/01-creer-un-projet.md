# Comment créer un projet dans le CRM

## Objectif de l'écran

L'écran de création de projet permet d'enregistrer un nouveau chantier, revendeur ou applicateur dans le CRM. C'est un formulaire en 5 étapes (un assistant, pas une seule longue page) : **Général**, **Détails**, **Contacts**, **Localisation**, **Action**. Un indicateur d'étapes en haut de l'écran montre où vous en êtes, et un bouton **Créer** (ou **Mettre à jour** si vous modifiez un projet existant) n'apparaît qu'à la dernière étape.

## Les 3 types de projet

Avant tout, l'écran demande de choisir un type parmi 3 options (sélection unique, comme un bouton radio) :

- **Project** (chantier) — un projet technique classique (le cas le plus courant).
- **Revendeur** — un point de vente partenaire.
- **Applicateur** — une entreprise qui applique le produit.

Le type choisi change quels champs sont obligatoires et quels champs apparaissent à l'étape "Détails" — voir plus bas.

## Étape 1 — Général

| Champ | Obligatoire ? | Explication |
|---|---|---|
| Nom du projet (*Project Name*, ou *Société / Nom* en mode Revendeur) | **Oui** | Le nom qui identifiera le projet partout dans le CRM (kanban, listes, rapports). Doit être unique pour un même utilisateur — voir "Erreurs possibles". |
| Date de démarrage (*Start Date*) | **Oui** (les 3 types) | Format JJ/MM/AAAA saisi via un sélecteur de date. Le serveur exige le format AAAA-MM-JJ en interne — utilisez toujours le sélecteur plutôt que de taper la date à la main. |
| Date de visite (*Visit Date*) | **Oui** (les 3 types) | La date prévue ou réalisée de la visite du chantier. |
| Montant marché (*Market Amount*) | Non | Le montant contractuel du projet. Utilisé ensuite par le Copilot IA pour évaluer les projets à risque budgétaire (voir la fonctionnalité "Business Reasoning" du Copilot). |
| Statut projet (*Project Status*) | Non (a une valeur par défaut) | Liste déroulante : Identification, Proposition technique, Proposition commerciale, Négociation, Livraison, Fidélisation. |
| Statut de validation (*Validation Status*) | Non | Validé / Non validé (par défaut "Non validé"). |
| Taux de réussite (*Success Rate*, 0–100) | Non | Un pourcentage d'avancement, saisi manuellement — c'est ce même champ que le Copilot IA utilise pour calculer si un projet est "bloqué" (voir Business Reasoning). |

## Étape 2 — Détails (le contenu change selon le type choisi à l'étape 1)

**Mode Project (chantier)** :
- Type de projet (optionnel), Type de site + adresse.
- Gamme de produit : Probar ou Promesh (à choisir), avec le diamètre associé.
- Surface prospectée en m² (optionnel).
- Promoteur, Bureau d'étude, Bureau de contrôle, Matricule fiscale, Entreprise fluide/électricité (tous optionnels).

**Mode Revendeur** :
- Comptoir (société), Téléphone comptoir, Téléphone comptoir 2, Registre de commerce (optionnels).
- Fonction : Achat ou Gérant.
- Nom / Prénom / Email du revendeur.
- Statut revendeur : Prospect, Offre, Actif, Raté.
- **Adresse revendeur — obligatoire.**

**Mode Applicateur** :
- **Dallagiste — obligatoire.**
- **Téléphone dallagiste — obligatoire.**
- **Matricule fiscale — obligatoire.**
- **Registre de commerce — obligatoire.**
- Email dallagiste (optionnel).
- Service technique (optionnel).

## Étape 3 — Contacts

**Mode Project uniquement.** Trois blocs identiques dans leur fonctionnement : **Société**, **Ingénieur**, **Architecte**. Pour chacun, vous choisissez dans une liste déroulante un contact déjà connu, ou "Autre" pour saisir un nouveau nom/téléphone/email directement. Aucun de ces champs n'est obligatoire pour créer le projet.

En mode Revendeur ou Applicateur, cette étape n'affiche aucun champ ("Contacts are only required for the Project type.") — passez directement à l'étape suivante.

## Étape 4 — Localisation

- **Adresse — obligatoire** pour un projet en mode Applicateur ou Revendeur.
- Pour un chantier (mode Project), la localisation se fait via **latitude/longitude** — obligatoire à la création, choisie sur la carte intégrée ou via la recherche d'adresse (les résultats sont limités à la Tunisie).
- Commentaire de localisation (optionnel).
- Message d'erreur si aucune position n'est choisie : *"Location is required"*.

## Étape 5 — Action

- **Prochaine action (*Next Action*) — obligatoire.** Liste déroulante : Visite, Plan technique, Échantillonnage, Devis envoyé, Négociation, Relance, Commande gagnée, Commande perdue. C'est cette action qui détermine l'étape suivante du projet dans le pipeline commercial.
- Pièce jointe (optionnel) — un seul fichier.
- Un résumé récapitule Projet / Type / Prochaine action / Mode avant validation finale.

## Boutons de l'écran

| Bouton | Effet |
|---|---|
| **Back** | Revient à l'étape précédente sans perdre les données déjà saisies. |
| **Next** | Valide l'étape courante et passe à la suivante. |
| **Create** (nouveau projet) / **Update** (projet existant) | Envoie le formulaire, disponible uniquement à la dernière étape. |
| **Update & Back** | Uniquement en modification : enregistre puis retourne à la liste des projets. |

## Actions possibles après création

Une fois le projet créé, vous pouvez : le déplacer d'une étape à l'autre du pipeline (kanban), lui assigner un propriétaire (responsable commercial), y attacher un devis (voir "Comment envoyer un devis ?"), y ajouter des actions/commentaires, et consulter son historique complet.

## Erreurs possibles

| Message affiché | Cause | Solution |
|---|---|---|
| "nomProjet est obligatoire" | Le nom du projet est vide. | Renseignez un nom à l'étape Général. |
| "dateDemarrage est obligatoire" | La date de démarrage est vide (mode chantier). | Choisissez une date via le sélecteur. |
| "dateDemarrage doit être au format YYYY-MM-DD" | La date a été saisie dans un format inattendu. | Utilisez toujours le sélecteur de date plutôt qu'une saisie manuelle. |
| "typeAdresseChantier est obligatoire" | Le type de site n'est pas renseigné (mode chantier). | Complétez le champ "Type de site" à l'étape Détails. |
| "latitude/longitude est obligatoire" | Aucune position n'a été choisie sur la carte (mode chantier). | Utilisez la recherche d'adresse ou cliquez sur la carte à l'étape Localisation. |
| "dallagiste est obligatoire" / "telephoneDallagiste est obligatoire" | Champs requis manquants en mode Applicateur. | Complétez-les à l'étape Détails. |
| "firstAction est obligatoire" / "dateVisite est obligatoire" | Champs requis manquants côté CRM (première action, date de visite). | Renseignez-les — la date de visite se saisit à l'étape Général, la première action à l'étape Action. |
| "telephoneIngenieur invalide" / "telephoneArchitecte invalide" / etc. | Le numéro contient des caractères non autorisés ou une longueur incorrecte (6 à 30 caractères, chiffres/+/espace/-/parenthèses uniquement). | Corrigez le format du numéro. |
| "Project name already exists" (HTTP 409) | Un projet portant exactement le même nom (insensible à la casse) existe déjà pour votre compte. | Choisissez un nom différent, ou retrouvez le projet existant plutôt que d'en créer un doublon. |

## Bonnes pratiques

- Choisissez le bon type (Project / Revendeur / Applicateur) **dès le départ** : en changer après coup peut faire disparaître des champs déjà saisis dans l'étape Détails.
- Utilisez toujours le sélecteur de date et la carte plutôt qu'une saisie manuelle — plusieurs erreurs de validation viennent d'un format de date ou de coordonnées mal saisi à la main.
- Renseignez le "Montant marché" et le "Taux de réussite" dès que possible : ce sont les deux champs que le Copilot IA utilise pour détecter automatiquement les projets qui nécessitent une attention (budget engagé sans avancement suivi, par exemple).
- Vérifiez qu'un projet du même nom n'existe pas déjà avant d'en créer un — le CRM refuse les doublons de nom pour un même compte (HTTP 409).
