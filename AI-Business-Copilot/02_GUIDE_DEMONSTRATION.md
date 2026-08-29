# AI Business Copilot — Guide de démonstration professionnelle

> Compagnon de `01_RAPPORT_FINAL.md`. Ce guide propose un script de
> démonstration en deux volets : un volet **preuve par le code** (aucun
> prérequis, fonctionne toujours, 5 minutes) et un volet **conversation en
> direct** (nécessite une clé LLM réelle, 15-20 minutes). Les deux sont
> honnêtes : le premier ne prétend pas être une conversation, le second ne
> fonctionne que si un fournisseur LLM est réellement configuré.

## 0. Prérequis

| Volet | Prérequis |
|---|---|
| Preuve par le code | Aucun — Node.js + les dépendances déjà installées (`npm install` côté `Backend Master`) |
| Conversation en direct | Base de données CRM accessible + `AI_COPILOT_ENABLED=true` + `AI_LLM_PROVIDER`/`AI_LLM_MODEL`/`AI_LLM_API_KEY` renseignés dans `Backend Master/.env` (voir `.env.example` lignes 87-108) + l'application Flutter compilée sur un appareil/émulateur |

Sans clé LLM réelle, `AIManager.handleMessage()` échoue proprement en
`NotConfiguredError` (503, message clair) — jamais un crash, jamais une
réponse inventée en façade. C'est un choix assumé du projet, pas un bug :
voir `01_RAPPORT_FINAL.md`, §5.

## 1. Volet "preuve par le code" (aucun prérequis)

Objectif : démontrer, EN DIRECT devant le jury, que chacune des 18
capacités demandées est réellement câblée — pas en l'affirmant, en
exécutant le vrai code de production.

```bash
cd "Backend Master"

# 1. Le noyau MCP/LangChain/RAG/Agents/Tools, en un seul run (148 suites,
#    ~4600 tests, quelques secondes)
npx jest --testPathPatterns="(ai\.|aiCopilot|aiDashboard)"

# 2. Le corpus de 532 scénarios métier, vérifiés contre le VRAI routage,
#    les VRAIES permissions, les VRAIS Tools (2685 tests)
npx jest test/ai.validation.copilotScenarios.test.js test/ai.validation.copilotEndToEnd.test.js

# 3. Compter les scénarios en direct (dépasse les 500 demandés)
node -e "console.log(require('./test/fixtures/copilotValidationScenarios').SCENARIOS.length)"
```

```bash
cd "Dash Master Toolkit"
flutter test test/ai   # 38 fichiers, 208 tests
```

Points à commenter pendant l'exécution :
- Le Tier 1 (`ai.validation.copilotScenarios.test.js`) ne resimule rien :
  il appelle le VRAI `IntentDetector`, le VRAI `AgentRegistry` (15 Agents
  réels), et le VRAI `isAuthorized()` — les mêmes objets que ceux exécutés
  en production.
- Chaque scénario vérifie 5 choses : l'intention détectée, le contexte
  requis (Tools/RAG), l'Agent + sa permission, les AI Tools attendus, et la
  permission au niveau Tool — voir §2 de `01_RAPPORT_FINAL.md` pour le
  détail capacité par capacité.

## 2. Volet "conversation en direct" (avec une clé LLM réelle)

### 2.1 Démarrage

```bash
cd "Backend Master"
npm run db:seed:superadmin-cbi   # crée un compte superadmin de démo, si pas déjà fait
npm run dev                       # démarre le backend (nodemon)
```

Côté Flutter : lancer l'application sur un appareil/émulateur, se
connecter avec le compte superadmin de démo, ouvrir le panneau Copilot
(bouton flottant, `copilot_fab.dart`).

### 2.2 Script de démonstration, capacité par capacité

Chaque étape correspond à une ligne du tableau §2 de `01_RAPPORT_FINAL.md`
— citer le fichier réel pendant la démo renforce la crédibilité.

1. **AI Dashboard (comprendre l'utilisateur, analyser les KPI, détecter les
   risques)** — ouvrir le panneau Copilot : le briefing proactif apparaît
   immédiatement (salutation nominative, compteurs du jour, score qualité
   CRM, cartes de risque/recommandation), sans qu'aucune question n'ait été
   posée. Aucun appel LLM ici (`dashboardBriefing.service.js` est
   entièrement déterministe) — la preuve que le "comprendre" ne dépend pas
   que du LLM.

2. **Context Awareness (comprendre le contexte)** — ouvrir la fiche d'un
   projet en retard dans le CRM, puis ouvrir le Copilot : les questions de
   démarrage proposées changent (Smart Suggestions spécifiques à l'écran
   projet — "Résume le projet.", "Analyse les risques.", ...). Poser "Quel
   est le statut de ce projet ?" SANS jamais nommer le projet : le Copilot
   répond sur LE BON projet — la preuve que le contexte d'écran a bien été
   transmis (voir le préfixe `[Contexte d'écran actuellement affiché : ...]`
   dans les logs backend si besoin).

3. **Comprendre le métier + AI Tools + MCP + LangChain** — poser "Quels
   projets sont en retard ?" : la réponse cite des projets réels, jamais
   inventés (elle vient de l'appel MCP réel `list_projects`, orchestré par
   LangChain). Montrer `src/ai/mcp/mcpServer.js` et expliquer le JSON-RPC
   2.0 réel derrière l'appel.

4. **Respecter les permissions** — se reconnecter avec un compte à rôle
   restreint (ex. un compte "user" simple) et poser "Quels sont mes KPI de
   contacts commerciaux ?" : le Copilot refuse poliment (rôle non
   autorisé pour `commercial_agent`) plutôt que d'halluciner un chiffre —
   montrer le scénario `com-17`/`com-23` du corpus qui verrouille
   exactement ce comportement.

5. **Détecter les anomalies** — poser "Y a-t-il des doublons ou des
   incohérences dans les données ?" : réponse structurée avec un score
   qualité et des corrections PROPOSÉES (jamais appliquées automatiquement
   — souligner ce choix de sécurité).

6. **Proposer des recommandations + expliquer son raisonnement** — poser
   "Conseille-moi sur mes priorités du jour" puis ouvrir le panneau
   d'explicabilité (`copilot_explainability_panel.dart`) : montrer que
   chaque recommandation cite les données/Tools réellement utilisés
   (`response.explainability.dataUsed`/`toolsCalled`), jamais une
   justification générique.

7. **Générer des rapports (PDF réel — nouveauté de cette passe)** — poser
   "Fais-moi un rapport de synthèse sur les indicateurs clés" : la réponse
   est une synthèse narrative (ReportingAgent, workflow LangChain à 2
   étapes). Cliquer sur l'icône PDF sous la réponse : un vrai fichier PDF
   se télécharge/s'ouvre (`POST /ai-copilot/reports/pdf`, pdfkit) — ouvrir
   le fichier pour montrer qu'il contient bien le texte de la réponse, mis
   en page.

8. **Préparer des emails** — poser une demande impliquant l'envoi d'un
   email (ex. relance client) : montrer que le Tool `send_notification_email`
   tente un envoi SMTP réel (pas un simulacre) — le confirmer dans les logs
   backend si l'environnement de démo n'a pas de SMTP réel branché.

9. **Préparer des réunions** — poser une demande de planification de
   réunion liée à un projet : montrer l'événement créé dans Google Calendar
   (OAuth2 réel, `googleCalendar.service.js`) si les identifiants Google
   sont configurés pour la démo.

10. **Préparer des workflows + guider les utilisateurs** — poser une
    automatisation multi-étapes ("automatise le suivi de ce client : crée
    un rappel puis envoie un email de relance") : le Copilot PROPOSE le
    plan avant d'agir ; répondre "confirme" pour l'exécuter, "annule" pour
    l'écarter — jamais une action silencieuse. Puis poser une question de
    documentation ("Comment fonctionne le calcul du Score Qualité ?") :
    réponse avec citations RAG réelles (sources documentaires), ou refus
    honnête si l'information n'est pas trouvée — jamais une invention.

11. **Proactive AI (bonus, si le temps le permet)** — expliquer que ce même
    noyau tourne aussi en arrière-plan (`proactiveMonitor.js`, 6 domaines :
    pipeline, ventes, maintenance, RH, industriel, KPI) et pousse des
    alertes via Socket.IO (`proactive-ai-alert`) avec des workflows
    confirmables, sans qu'aucune question n'ait été posée par l'utilisateur.

### 2.3 Ce qu'il ne faut jamais dire pendant la démo

- Ne jamais présenter une réponse du Copilot comme "toujours exacte" — le
  script ci-dessus est choisi pour des cas où les données de démo sont
  connues à l'avance, précisément pour pouvoir vérifier la réponse en
  direct.
- Ne jamais dire "aucune limite connue" — les limites du §5 de
  `01_RAPPORT_FINAL.md` (couverture lexicale, dépendance à une clé LLM)
  sont réelles et assumées ; les mentionner renforce la crédibilité plutôt
  que de l'affaiblir.
