# Comment modifier une opportunité dans le CRM

## Ce qu'est une "opportunité" dans ce CRM

Il n'y a pas d'écran séparé intitulé "Opportunité" : dans ce CRM, une opportunité commerciale correspond à un **contact commercial** (client/prospect) et à sa position dans le pipeline de vente — le champ **"Next Action"** (prochaine action) sur la fiche du contact. Modifier une opportunité, c'est donc modifier ce champ (et éventuellement les autres informations du contact) via la boîte de dialogue **"Edit contact"**, accessible depuis la liste des contacts commerciaux (icône crayon).

## Les 8 étapes du pipeline commercial

| Valeur affichée | Signification |
|---|---|
| Prospect | Premier contact, rien n'est encore engagé. |
| Plan technique | Une proposition technique est en préparation. |
| Échantillonnage | Des échantillons produits ont été transmis. |
| Devis envoyé | Un devis a été envoyé au client (voir "Comment envoyer un devis ?"). |
| Négociation | Le client discute les conditions/le prix. |
| Relance | Le contact est en attente d'une relance. |
| Commande gagnée (Gagné) | L'opportunité est conclue positivement. |
| Commande perdue (Perdu) | L'opportunité est perdue. |

**⚠️ Point d'attention réel :** la liste déroulante de l'écran propose "Plan technique", "Échantillonnage" et "Relance", mais le modèle de données du serveur n'autorise techniquement que ces valeurs : `Prospect`, `Contacté`, `Visite`, `Devis envoyé`, `Negociation`, `Gagné`, `Perdu`. Si vous rencontrez une erreur serveur en changeant l'étape d'un contact vers "Plan technique", "Échantillonnage" ou "Relance", c'est la cause probable — dans ce cas, choisissez la valeur la plus proche parmi celles listées ci-dessus, ou signalez l'incohérence à l'équipe technique plutôt que de réessayer plusieurs fois.

## Comment modifier une opportunité, étape par étape

1. Ouvrez la liste des contacts commerciaux.
2. Repérez le contact concerné et cliquez sur l'icône crayon ("Edit contact").
3. Dans la boîte de dialogue qui s'ouvre, retrouvez le champ **"Next Action"** — c'est la liste déroulante de l'étape du pipeline.
4. Choisissez la nouvelle étape.
5. Vous pouvez, à la même occasion, mettre à jour n'importe quel autre champ du contact (téléphone, statut, produits, projets — voir "Comment créer un client ?" pour le détail de chaque champ, les mêmes s'appliquent ici).
6. Cliquez sur **"Save"** pour enregistrer, ou **"Cancel"** pour annuler sans rien changer.

## Boutons de l'écran

| Bouton | Effet |
|---|---|
| **Save** | Enregistre toutes les modifications faites dans la boîte de dialogue. |
| **Cancel** | Ferme la boîte de dialogue sans rien enregistrer. |

## Actions possibles

Changer l'étape du pipeline, mettre à jour les coordonnées du contact, ajouter/retirer des produits ou projets liés, programmer une nouvelle relance (date, heure, commentaire), consulter l'historique des changements de statut du contact.

## Erreurs possibles

| Situation | Cause probable | Solution |
|---|---|---|
| Erreur serveur en changeant l'étape vers "Plan technique", "Échantillonnage" ou "Relance" | Ces valeurs, proposées par l'écran, ne font pas partie des valeurs strictement acceptées par le serveur (voir l'avertissement plus haut). | Choisissez une des valeurs confirmées : Prospect, Devis envoyé, Négociation, Gagné, Perdu. |
| Les champs Nom/Prénom/Téléphone semblent vides après modification | Un de ces champs obligatoires a été effacé par erreur. | Voir "Comment créer un client ?" — ces trois champs restent obligatoires côté serveur, même en modification. |

## Bonnes pratiques

- Faites avancer l'étape du pipeline **au fur et à mesure**, dès qu'un événement réel se produit (devis envoyé, négociation entamée) — un pipeline à jour est ce que la Direction consulte pour ses KPI et rapports.
- Documentez chaque changement d'étape important dans le champ **Message / Notes** du contact, pour que le contexte reste compréhensible à toute personne qui reprendrait le suivi.
- Après un changement d'étape vers "Devis envoyé", pensez à effectivement déposer le devis sur le projet correspondant (voir "Comment envoyer un devis ?") — le champ du pipeline seul ne joint aucun fichier.
