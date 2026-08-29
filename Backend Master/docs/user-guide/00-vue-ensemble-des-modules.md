# Vue d'ensemble des modules du CRM

Ce document liste tous les modules du CRM et leur objectif général, pour orienter vers le bon module. Six guides détaillés, séparés de celui-ci, couvrent chacun un parcours précis en profondeur (objectif de l'écran, champ par champ, boutons, erreurs, bonnes pratiques) : fichiers `01-creer-un-projet.md`, `02-creer-un-client.md`, `03-envoyer-un-devis.md`, `04-creer-une-intervention.md`, `05-modifier-une-opportunite.md`, `06-utiliser-le-copilot-ia.md`. Pour les autres modules ci-dessous, ce document reste un aperçu général (objectif, écrans principaux, permissions) plutôt qu'un guide détaillé.

## Projets (module "Project Management")

Gestion des chantiers, revendeurs et applicateurs : liste, création (assistant en 5 étapes), pipeline visuel (kanban), changement d'étape, assignation de propriétaire, devis, actions et commentaires. Écrans principaux : "Projects" (liste), le formulaire de création/modification, le tableau kanban par étape. Ouvert à tout utilisateur connecté pour la consultation ; changer l'étape ou le propriétaire d'un projet est réservé aux rôles admin/superadmin.

## Commercial (contacts commerciaux / clients)

Gestion des clients et prospects, leur pipeline de vente, leurs relances programmées et leurs indicateurs (KPI). Écrans principaux : "Commercial Contacts" (liste), "New Commercial Contact"/"Edit contact", "KPI Commercial Contacts". Les KPI détaillés de contacts commerciaux sont réservés aux rôles commercial/admin/superadmin.

## Pipeline commercial (étapes)

Configuration des étapes du pipeline utilisées par le kanban des projets (nom, couleur, ordre, étape "gagnée"/"perdue"). Consultation ouverte à tout utilisateur ; créer, modifier, réordonner ou supprimer une étape est réservé aux rôles admin/superadmin.

## Maintenance

Signalement et suivi des pannes d'équipement ("Nouvelle demande de maintenance" — voir `04-creer-une-intervention.md`), historique des interventions. Tout utilisateur peut signaler une panne et suivre ses propres demandes ; accepter/refuser une demande, affecter un technicien ou clôturer une intervention est réservé aux rôles admin/superadmin/responsable logistique-achat (ou au contact maintenance désigné).

## RH (ressources humaines)

Soumission et suivi des demandes de congé et d'autorisation de sortie ("RH — Demandes de congé", "RH — Demandes d'autorisation", "Profils RH"). Tout utilisateur peut soumettre une demande et suivre les siennes ; accepter, refuser ou marquer une demande comme traitée est réservé aux rôles admin/superadmin (ou au responsable RH désigné).

## Industriel (production PROBAR / PROMESH, fiches de mélange)

Fiches de production industrielle (PROBAR, PROMESH, mélange), historique de production. Réservé aux rôles admin/superadmin/responsable logistique-achat.

## POR PROMESH

Fiches de suivi d'équipe pour la ligne de production PROMESH (contrôle machine, contrôle qualité, statistiques du poste), avec un cycle brouillon → validation (verrouillage définitif une fois validée). Réservé aux rôles admin/superadmin/responsable logistique-achat pour la création/consultation ; la suppression est réservée à admin/superadmin.

## Tableau de bord (Dashboard) et Rapports

Indicateurs clés (KPI) — personnels pour tout utilisateur, globaux/consolidés/historiques réservés aux rôles admin/superadmin. Le module Rapports transforme ces mêmes indicateurs en synthèse narrative (tendances, points d'attention) plutôt qu'en simple liste de chiffres.

## Utilisateurs (administration des comptes)

Liste des utilisateurs, activation/désactivation de compte, gestion des rôles, profils. Consultation de son propre profil ouverte à tous ; lister/gérer les autres comptes est réservé aux rôles admin/superadmin (changer le rôle d'un compte est réservé à superadmin uniquement).

## Notifications

Liste des notifications personnelles, marquage lu/non lu, suppression. Ouvert à tout utilisateur pour ses propres notifications ; envoyer un email de notification à un autre utilisateur est réservé aux rôles admin/superadmin.

## Calendrier / Google Calendar

Programmation de rendez-vous et rappels, synchronisation avec le calendrier Google personnel de l'utilisateur connecté.

## Automatisation

Enchaînement de plusieurs actions à travers différents modules en une seule demande (ex. créer une demande de maintenance puis notifier l'équipe). Réservé aux rôles admin/superadmin.

## Le Copilot IA (AI Business Copilot)

Un assistant conversationnel qui répond aux questions sur les données du CRM (« Quels projets sont en retard ? », « Quels clients dois-je relancer ? »), au-delà du présent assistant qui explique COMMENT utiliser les écrans. Voir `06-utiliser-le-copilot-ia.md` pour le guide d'usage complet, et `src/ai/README.md` pour le détail technique du kernel.
