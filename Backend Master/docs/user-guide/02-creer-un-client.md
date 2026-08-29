# Comment créer un client (contact commercial) dans le CRM

## Objectif de l'écran

L'écran **"New Commercial Contact"** (Nouveau contact commercial) permet d'enregistrer un client ou prospect, avec ses informations de contact, les produits qui l'intéressent, ses projets potentiels, et son statut dans le suivi commercial. C'est une seule page (pas un assistant en plusieurs étapes), organisée en 3 sections : **Informations client**, **Produits**, **Projets**.

## Section 1 — Informations client

| Champ | Obligatoire ? | Explication |
|---|---|---|
| Nom (*Last Name*) | **Oui** côté serveur | Exemple affiché : "Ben Salah". |
| Prénom (*First Name*) | **Oui** côté serveur | Exemple affiché : "Ali". |
| Téléphone (*Phone*) | **Oui** côté serveur | Exemple affiché : "22123456". |
| Entreprise (*Company*) | Non | Exemple affiché : "CBI Tunisia". |
| Matricule fiscale | Non | Exemple affiché : "1234567AAM000". |
| Email | Non | Doit être un email valide s'il est renseigné. |
| Localisation | Non | Exemple : "Tunis, Sousse...". |
| Message / Notes | Non | Informations complémentaires libres. |
| Type de client (*Client Type*) | Non (par défaut) | Liste déroulante : Tuteur (*Supervisor*), Clôture (*Closure*), Bâtiment (*Batiment*). |
| Statut du contact (*Contact Status*) | Non (par défaut "Injoignable") | OK, À rappeler plus tard, Injoignable, Client refusé. |
| Date d'appel (*Call Date*) | Non | Choisie via un sélecteur de date. |
| Prochaine action / étape (*Next Action*) | Non (par défaut "Prospect") | C'est l'étape du contact dans le pipeline commercial — voir "Comment modifier une opportunité ?" pour le détail des 8 valeurs possibles. |

**⚠️ Important — écart entre l'écran et le serveur :** l'écran de création n'empêche d'enregistrer que si Nom, Téléphone **et** Email sont TOUS les trois vides (message : *"Remplis au moins Nom, Téléphone ou Email"*). Mais le serveur, lui, EXIGE toujours Nom **et** Prénom **et** Téléphone. Concrètement : si vous ne renseignez que l'email, l'écran vous laissera cliquer sur "Save Contact", mais l'enregistrement sera refusé par le serveur avec un message "prenom obligatoire" ou "nom obligatoire". **Renseignez toujours Nom, Prénom et Téléphone**, même si l'écran ne les marque pas comme strictement bloquants.

## Section 2 — Produits

Une ligne par produit qui intéresse ce client : **Produit** (exemple : PROBAR) et **Quantité**. Le bouton **"Add Product"** ajoute une nouvelle ligne ; l'icône de suppression (poubelle) retire une ligne. Si aucun produit n'est renseigné, le CRM enregistre automatiquement une ligne par défaut ("PROBAR", quantité 1).

## Section 3 — Projets potentiels

Une ligne par projet potentiel associé à ce client : **Nom du projet**, **Localisation**, **Type**, **Description**. Le bouton **"Add Project"** ajoute une ligne ; l'icône de suppression la retire. Une ligne sans nom de projet est ignorée à l'enregistrement.

## Bouton de l'écran

**"Save Contact"** — le seul bouton d'action, en bas de l'écran. Valide et enregistre le contact avec ses produits et projets associés, puis retourne à la liste des contacts commerciaux.

## Modifier un client existant

Depuis la liste des contacts commerciaux, un clic sur l'icône crayon ouvre la boîte de dialogue **"Edit contact"** — les mêmes champs, pré-remplis, avec les boutons **"Cancel"** et **"Save"**.

## Actions possibles après création

Programmer une relance (date/heure/commentaire), changer le statut ou l'étape du pipeline (voir "Comment modifier une opportunité ?"), affecter le contact à un commercial (action admin "Affecter des contacts"), consulter l'historique des changements de statut.

## Erreurs possibles

| Message affiché | Cause | Solution |
|---|---|---|
| "Remplis au moins Nom, Téléphone ou Email" | Les trois champs Nom, Téléphone et Email sont vides. | Renseignez au moins l'un des trois — mais voir l'avertissement ci-dessus : mieux vaut renseigner les trois champs réellement obligatoires (Nom, Prénom, Téléphone). |
| "nom obligatoire" / "prenom obligatoire" / "telephone obligatoire" (erreur serveur) | Un des trois champs obligatoires côté serveur est vide, alors que l'écran a laissé passer l'enregistrement. | Complétez Nom, Prénom et Téléphone avant d'enregistrer. |

## Bonnes pratiques

- Renseignez toujours **Nom, Prénom et Téléphone**, même si l'écran semble l'accepter sans — c'est la seule combinaison garantie d'être acceptée par le serveur.
- Choisissez le bon **Type de client** dès la création : il sert à filtrer et classer les contacts dans les rapports commerciaux.
- Utilisez la section **Produits** pour indiquer ce qui intéresse réellement le client — ces informations alimentent les statistiques KPI commerciales consultées par la Direction.
- Positionnez la **Prochaine action** dès la création plutôt que de la laisser à "Prospect" par défaut si le contact est en réalité déjà plus avancé dans le cycle de vente.
