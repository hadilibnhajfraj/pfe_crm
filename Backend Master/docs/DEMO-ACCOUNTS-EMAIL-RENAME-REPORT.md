# Changement d'adresse des comptes de démonstration — rapport

Exécuté le 10/10/2026 à 23 h 47 dans `cbigestionnairepfe_demo` uniquement.

**Résultat : les 10 comptes du lot `DEMO-demo-powerbi-v1-s20261010` portent une adresse `@cbi_tunisia.com`. 10 comptes modifiés, 39 contrôles sur 39, aucune erreur. Seule la colonne `email` a changé.**

Aucun mot de passe ni aucune empreinte n'a été lu, affiché ou écrit dans un rapport.

## 1. Correspondance appliquée

| Rôle | Ancienne adresse | Nouvelle adresse |
|---|---|---|
| `commercial` | `demo.commercial01@demo.invalid` | `demo.commercial01@cbi_tunisia.com` |
| `commercial` | `demo.commercial02@demo.invalid` | `demo.commercial02@cbi_tunisia.com` |
| `commercial` | `demo.commercial03@demo.invalid` | `demo.commercial03@cbi_tunisia.com` |
| `commercial` | `demo.commercial04@demo.invalid` | `demo.commercial04@cbi_tunisia.com` |
| `commercial` | `demo.commercial05@demo.invalid` | `demo.commercial05@cbi_tunisia.com` |
| `commercial` | `demo.commercial06@demo.invalid` | `demo.commercial06@cbi_tunisia.com` |
| `commercial_sedentaire` | `demo.commercial-sedentaire01@demo.invalid` | `demo.commercial_sedentaire01@cbi_tunisia.com` |
| `commercial_sedentaire` | `demo.commercial-sedentaire02@demo.invalid` | `demo.commercial_sedentaire02@cbi_tunisia.com` |
| `responsable_logistique_achat` | `demo.responsable-logistique-achat01@demo.invalid` | `demo.responsable_logistique_achat01@cbi_tunisia.com` |
| `admin` | `demo.admin01@demo.invalid` | `demo.admin01@cbi_tunisia.com` |

Les identifiants des comptes (dérivés du lot et du rôle) sont inchangés ; chacun est dans `data_change_log`.

## 2. Ce qui a été fait

- **Générateur** : `demo.config.json` reçoit `identity.accountEmailDomain = "cbi_tunisia.com"`. Le plan produit désormais ces adresses pour les comptes ; les autres adresses (ingénieurs, architectes, contacts) restent en `@demo.invalid`.
- **Opération** : nouvelle commande `--rename-account-emails` (`lib/accounts.js`), qui n'utilise ni le code du CRM ni ses services. Elle n'émet que `UPDATE users SET email` et l'entrée de journal correspondante, dans une seule transaction.
- **Sauvegarde** : `backups/cbigestionnairepfe_demo_20261010_224706.dump`, prise juste avant.

## 3. Contrôles réussis

| Contrôle | Résultat |
|---|---|
| Base connectée | `cbigestionnairepfe_demo`, vérifiée avant l'opération et dans la transaction |
| Comptes concernés | les 10 du registre du lot, et eux seuls |
| Adresses | 10 nouvelles, toutes différentes ; plus aucune `@demo.invalid` parmi ces comptes |
| Rôles, états | inchangés ; les 10 comptes sont actifs |
| Mots de passe | empreintes inchangées : l'empreinte du contenu des comptes, adresse exclue, est identique avant et après |
| Relations | chaque compte garde ses projets, ses contacts et ses fiches (6 commerciaux : 13 ou 14 projets chacun ; responsable production : 160 fiches) |
| Données commerciales et industrielles, référentiels | empreinte identique sur les 25 tables surveillées, contrôlée avant de valider la transaction |
| Journal | 10 entrées `UPDATE` sur `email`, avec ancienne et nouvelle adresse ; aucune ne contient d'empreinte |
| Envois | aucun : 0 e-mail en file, 0 demande de réinitialisation, 0 notification créée par l'opération |
| Deuxième exécution | simulation du générateur relancée : 2 182 lignes reconnues, 0 à créer, 0 violation |

**Authentification** : `POST /auth/signin` accepte ces adresses (sa règle de format tolère le tiret bas), le modèle `User` n'a pas de validateur d'adresse et l'écran de connexion Flutter ne contrôle pas le format.

**Autres bases** : `cbigestionnairepfe`, `cbigestionnairepfe_mig_test` et `cbigestionnairepfe_demo_test` sont identiques avant et après (comptes, contenu des comptes, journal) ; aucune ne contient d'adresse `@cbi_tunisia.com`.

## 4. Tests

27 tests ajoutés (`test/demoSeeder.accounts.test.js`), tous réussis. Ils n'ouvrent aucune base : la correspondance est une fonction pure et l'opération tourne contre une base simulée qui enregistre chaque requête.

- 10 adresses uniques, au format demandé ; aucune `@demo.invalid` ;
- identifiants et rôles conservés ; seul l'e-mail change dans le plan ;
- nouvelle simulation déterministe ;
- seules écritures émises : la colonne `email` et le journal ; rien d'autre ne bouge ;
- refus sur `cbigestionnairepfe`, `cbigestionnairepfe_mig_test`, `cbigestionnairepfe_demo_test`, `cbigestionnairepfe_test` et `postgres`, avant toute lecture ;
- annulation complète si une donnée métier change pendant l'opération ;
- refus si un compte a une adresse inattendue, est inactif, a changé de rôle, ou si une nouvelle adresse est déjà prise ;
- ni mot de passe ni empreinte dans le rapport, le journal ou les requêtes.

**Non exécutée** : la suite d'intégration existante (`test/demoSeeder.test.js`) recrée la base `cbigestionnairepfe_demo_test`, que vous avez demandé de ne pas modifier. Son assertion sur le domaine des comptes est mise à jour, mais elle n'a pas été relancée.

## 5. Points à connaître

1. **`cbi_tunisia.com` n'est pas un nom de domaine valide** : le tiret bas est interdit dans un nom d'hôte. Aucune boîte aux lettres ne peut exister à ces adresses. Le domaine réel de l'entreprise s'écrit avec un tiret (`cbi-tunisia.com`) ; les deux se ressemblent à l'écran.
2. **Les validateurs stricts refusent ce domaine** (`isEmail` des modèles ingénieur, architecte, contact, projet). Les comptes ne passent pas par eux, mais saisir une de ces adresses dans un champ e-mail d'un projet ou d'un contact serait refusé.
3. **100 relances gardent l'ancienne adresse du commercial** dans leur colonne recopiée `commercialEmail` : c'est une donnée commerciale, donc non modifiée. Elle ne correspond plus à l'adresse du compte.
4. **Les mots de passe restent inconnus** : ces comptes ne sont toujours pas connectables sans réinitialisation.
5. **L'empreinte du plan a changé** (`264b08099dfe4776`), puisque les adresses des comptes en font partie. Les identifiants de toutes les lignes sont les mêmes.

## 6. Constat sans rapport avec cette opération

La base de démonstration contient des lignes qui ne viennent pas du générateur. Elles datent de 22 h 16 et 22 h 17, une heure et demie avant le changement d'adresse :

- **1 compte `superadmin2`** et son profil, créés à 22 h 16 : c'est le compte que le backend crée de lui-même à son démarrage (`ensureSuperadmin2`, `src/app.js`).
- **150 notifications `FOLLOWUP_MISSING`** créées à 22 h 17 : 95 « Email manquant » et 55 « Relance manquante ». C'est la tâche planifiée de relance du CRM.
- **3 connexions sont ouvertes sur la base de démonstration** en ce moment.

Un backend a donc été lancé sur `cbigestionnairepfe_demo`, tâches planifiées actives. Conséquences :

- le contrôle du lot (`--verify`) signale 5 écarts sur 58, tous dus à ces lignes ;
- la tâche de relance ajoutera 150 notifications par jour tant que ce backend tourne ;
- la suppression ciblée du lot pourrait être refusée : ces notifications citent des contacts et des utilisateurs du lot (non vérifié).

Je n'ai touché ni à ces lignes ni au backend.

## 7. Commandes

```
node scripts/demo-seeder/index.js --rename-account-emails        # montre l'état, n'écrit rien
npx jest test/demoSeeder.accounts                                # 27 tests, sans base
```

Retour arrière : chaque entrée du journal porte l'ancienne adresse ; la sauvegarde d'avant opération est disponible.
