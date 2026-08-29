# Comment envoyer un devis dans le CRM

## Objectif de l'écran

L'écran **"Uploader Devis"** (création) ou **"Edit Devis"** (modification) permet d'attacher un document de devis à un projet précis, et de le publier. On y accède depuis la fiche d'un projet — un devis est toujours rattaché à UN projet, jamais créé seul.

## Champs de l'écran

| Champ | Obligatoire ? | Explication |
|---|---|---|
| Projet | Affiché (lecture seule) | Le projet auquel ce devis sera attaché — une carte en haut de l'écran le rappelle. |
| Nom du devis (*Nom du devis \**) | **Oui** | Le nom qui identifiera ce devis dans la liste des devis du projet. |
| Fichier(s) | **Oui, au moins 1** | Formats acceptés : PDF, PNG, JPG. Glissez-déposez le fichier dans la zone prévue, ou cliquez sur le bouton **"Upload file"**. Plusieurs fichiers peuvent être ajoutés en une fois. |
| Matricule fiscale | **Demandé uniquement à la publication**, pas à l'enregistrement | Si le matricule fiscale du client n'est pas encore renseigné, une boîte de dialogue apparaît au moment de publier pour le demander (avec les boutons "Ignorer" ou "Enregistrer"). |

## Bouton de l'écran

**"PUBLISH"** — le seul bouton d'action, fixé en bas de l'écran. Valide le nom du devis, vérifie qu'au moins un fichier est présent, demande le matricule fiscal si besoin, puis envoie le devis.

## Étape par étape

1. Ouvrez la fiche du projet concerné.
2. Accédez à la section Devis, puis à "Uploader Devis" (ou l'icône d'édition sur un devis existant pour "Edit Devis").
3. Saisissez le **Nom du devis**.
4. Glissez-déposez le fichier ou cliquez sur **"Upload file"** (PDF/PNG/JPG).
5. Cliquez sur **PUBLISH**.
6. Si le matricule fiscal du client manque, une boîte de dialogue le demande — vous pouvez le renseigner immédiatement ("Enregistrer") ou publier sans ("Ignorer").
7. Message de confirmation : *"Devis publié ✅ + Matricule enregistré ✅"* (ou *"Devis mis à jour ✅"* en modification).

## Actions possibles

Modifier un devis existant (nouveau fichier optionnel, nom modifiable), supprimer un devis, consulter la liste de tous les devis attachés à un projet.

## Erreurs possibles

| Message affiché | Cause | Solution |
|---|---|---|
| "Nom du devis est obligatoire" | Le champ nom est vide. | Saisissez un nom pour le devis. |
| "Choisis au moins 1 fichier (PDF/PNG/JPG)" | Aucun fichier n'a été sélectionné. | Glissez-déposez ou téléversez un fichier avant de publier. |
| "Matricule fiscale obligatoire pour publier" | Le client associé au projet n'a pas de matricule fiscal renseigné. | Renseignez-le dans la boîte de dialogue proposée, ou complétez-le plus tard sur la fiche client. |
| "devisId introuvable" | Erreur technique lors d'une modification — le devis n'a pas pu être retrouvé. | Rechargez la liste des devis du projet et réessayez. |
| "Aucun fichier lisible" | Le fichier sélectionné n'a pas pu être lu (fichier corrompu ou format non supporté). | Vérifiez que le fichier est bien un PDF, PNG ou JPG valide. |

## Bonnes pratiques

- Donnez un **nom de devis explicite** (ex. "Devis v2 — révision budget") plutôt qu'un nom générique — plusieurs devis peuvent être attachés au même projet au fil du temps.
- Renseignez le matricule fiscal du client dès que possible plutôt que de systématiquement l'ignorer : il est nécessaire pour la facturation qui suivra un devis accepté.
- Un devis correspond, côté suivi commercial, à l'étape "Devis envoyé" du pipeline — pensez à faire avancer le statut du projet ou du contact commercial en conséquence (voir "Comment modifier une opportunité ?").
