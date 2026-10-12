# AI Business Copilot — `lib/ai/`

Le Copilot IA côté Flutter — intégré comme Microsoft Copilot : présent partout dans l'application (un bouton flottant, jamais une page à part), pas une simple fenêtre de chat isolée. Ce document est le guide développeur de ce module ; pour le point de vue utilisateur, voir `Backend Master/docs/user-guide/06-utiliser-le-copilot-ia.md` ; pour le contrat serveur exact, voir `Backend Master/src/modules/ai-copilot/AI_COPILOT_HTTP.md`.

## Où il apparaît

Un seul point d'intégration dans le reste de l'app : `lib/app_shell_route/app_shell.dart` ajoute `floatingActionButton: const CopilotFab()` et `endDrawer: const CopilotChatDrawer()` au `Scaffold` déjà existant — additif uniquement, rien d'autre dans ce fichier n'a changé. Comme `AppShell` enveloppe **toute** route authentifiée (`ShellRoute` de `lib/route/my_route.dart`), le Copilot est visible sur chaque écran du CRM sans qu'aucun autre écran n'ait eu à être modifié.

## Structure

```
lib/ai/
├── models/       Sérialisation manuelle (fromJson), même convention que lib/models/
├── services/      REST (Dio) + WebSocket (Socket.IO) + stubs voix/pièces jointes
├── providers/     GetX (CopilotController, CopilotUiController, CopilotHistoryController)
├── widgets/       Composants réutilisables (FAB, bulle, avatar, suggestions, ...)
├── screens/       Compositions (drawer desktop, bottom sheet mobile, corps partagé)
├── theme/         Couleurs/styles du Copilot, construits SUR la palette existante
└── animations/    Pulse, points de frappe, révélation de message, curseur de streaming
```

## Backend/desktop/mobile — comment ça communique

| Composant | Rôle |
|---|---|
| `services/copilot_api_service.dart` | REST — `POST /ai-copilot/chat`, `GET /ai-copilot/conversations`, `GET /ai-copilot/conversations/:id`, `GET /ai-copilot/dashboard`. Réutilise `ApiClient.instance.dio` (même singleton que tout le reste de l'app). |
| `services/copilot_socket_service.dart` | WebSocket — canal `ai-copilot:*` sur le MÊME `SocketService.instance` que les notifications/demandes d'archivage/RH/maintenance (jamais une seconde connexion). |
| `providers/copilot_controller.dart` | Préfère le WebSocket quand connecté (typing + chunks + réponse complète) ; retombe automatiquement sur REST sinon (réponse d'un coup). |

Le contrat exact (payloads REST, événements WebSocket) est documenté côté backend dans `AI_COPILOT_HTTP.md` — les modèles de `lib/ai/models/` en sont le reflet 1:1, jamais un champ inventé côté client.

## Ce qui est "architecture uniquement" — honnête, pas caché

Deux fonctionnalités demandées existent comme **contrat + UI**, sans être fonctionnellement complètes, exactement comme leur pendant backend :

- **Bouton vocal** (`widgets/copilot_voice_button.dart`, `services/copilot_voice_service.dart`) : aucun package de reconnaissance vocale (`speech_to_text`/`record`) n'est ajouté — le projet n'en avait aucun, et ça engage des permissions plateforme qui doivent rester un choix produit explicite. `ICopilotVoiceService` définit déjà le contrat ; brancher une vraie implémentation ne touchera aucun widget.
- **Documents joints** (Phase 2 — `widgets/copilot_attachment_button.dart`, `services/copilot_attachment_service.dart`, `CopilotController.uploadAttachment`) : sélection PDF/DOCX/XLSX/CSV/TXT (10 Mo max., vérifié localement puis par le backend), envoi à `POST /ai-copilot/documents`, puce avec état envoi/prêt/erreur. Seuls les `documentIds` des documents prêts partent avec le message ; retirer une puce prête supprime le document côté serveur.

## Streaming — ce que c'est vraiment

Le backend ne fait PAS de vrai streaming token-par-token (aucun `ILlmProvider` ne l'implémente, voir `AI_COPILOT_HTTP.md`) : `ai-copilot:chunk` découpe une réponse déjà complète en groupes de mots, envoyés avec un court délai. `CopilotController` consomme ces chunks pour donner un effet de révélation progressive (voir `CopilotStreamingCursor`), mais ce n'est pas de la génération incrémentale réelle — même honnêteté que côté backend.

## Copier / régénérer / stop generation

- **Copier** (`CopilotController.copyMessage()`) — `Clipboard.setData` sur le texte du message ; disponible sur tout message complet et non vide (utilisateur ET assistant), jamais pendant le streaming.
- **Régénérer** (`CopilotController.regenerate()`) — reprend le DERNIER message utilisateur et redemande une réponse, en remplaçant la dernière bulle assistant affichée. Uniquement proposé sur le tout dernier message assistant (voir `CopilotMessageActions.isLastAssistantMessage`, calculé par `CopilotPanelBody._ChatView` via `lastIndexWhere`, jamais juste "le dernier de la liste"). **Le backend, lui, ne supprime rien** — aucune capacité "annuler le dernier tour" dans `IConversationMemory` — la conversation côté serveur garde donc le tour original ET le tour régénéré ; seule cette interface affiche la version la plus récente.
- **Stop generation** (`CopilotController.stopGenerating()`) — RÉELLEMENT annulé côté REST (`CancelToken` transmis à `CopilotApiService.sendMessage()`) ; côté WebSocket, ignore seulement les événements suivants (`_turnStopped`, un simple booléen — un seul tour actif à la fois, `isSending` le garantit) car le contrat `ai-copilot:*` n'offre aucune capacité d'annulation côté serveur (voir `AI_COPILOT_HTTP.md`). Un texte déjà partiellement reçu reste affiché ; un tour arrêté avant le premier chunk affiche "Génération interrompue.".

## Context Awareness — le Copilot sait où se trouve l'utilisateur

Le Copilot connaît automatiquement l'écran sur lequel se trouve l'utilisateur — fiche projet, fiche client, dashboard, fiche industrielle (Probar/Promesh) — sans que l'utilisateur ait à le répéter dans sa question. Le contrat serveur exact (forme du champ, formatage, limites) est documenté dans `AI_COPILOT_HTTP.md`, section "Context Awareness" ; cette section décrit uniquement le côté client.

**`models/copilot_page_context.dart`** — `CopilotPageContext`, 4 fabriques nommées correspondant aux 4 écrans réels, chacune construisant un `data` qui OMET tout champ `null`/vide (jamais de `null` ni de chaîne/liste vide envoyée pour rien — `zéro` reste en revanche une vraie valeur, jamais traité comme "absent") :

| Fabrique | Champs | Écran réel qui l'appelle |
|---|---|---|
| `CopilotPageContext.project(...)` | nom, client, famille produit, diamètre, budget, statut, taux de réussite, surface | `forms/view/project_form_screen.dart` |
| `CopilotPageContext.client(...)` | nom, étape pipeline, liste des projets, nombre de relances, dernière relance | `application/users/view/commercial_contact_list_getx_screen.dart` |
| `CopilotPageContext.dashboard(...)` | KPI (total/validés/non validés/taux), alertes (relances en retard), priorités (relances du jour/à venir) | `dashboard/academic/view/dashboard_screen.dart` |
| `CopilotPageContext.industrial(...)` | famille (PROBAR/PROMESH), machine, poste, diamètres, conformité, description non-conformité, référence commande (si réellement fournie — jamais fabriquée) | `forms/por_promesh/view/por_promesh_detail_screen.dart` et `forms/industrial/view/probar/probar_detail_screen.dart` |

**`providers/copilot_context_controller.dart`** — `CopilotContextController` (GetX, `.to` singleton), un seul `Rxn<CopilotPageContext> current` pour toute l'app (un seul écran de contexte actif à la fois, cohérent avec "un seul FAB/panneau Copilot"). `setContext(context)` remplace le contexte actif ; `clearContext([owner])` sans argument efface toujours, mais avec un `owner` ne clarifie QUE si `owner` est encore le contexte actif (`identical()`) — protège contre le cas où un écran qui se ferme lentement (son `dispose()` arrive en retard) efface le contexte d'un écran ouvert entre-temps. Chaque écran intégré appelle `clearContext()` dans son propre `dispose()`.

**Inclusion automatique, pas un bouton à activer** — `CopilotController._runAssistantTurn()` lit `CopilotContextController.to.current.value?.toJson()` À CHAQUE tour (jamais mis en cache), et le transmet à `CopilotApiService.sendMessage(pageContext:)` (REST) et `CopilotSocketService.send(pageContext:)` (WebSocket). Un changement d'écran EN COURS de conversation se reflète donc dès le tour suivant, sans que l'utilisateur n'ait à rouvrir le Copilot.

**Indicateur visuel** — `widgets/copilot_context_chip.dart` (`CopilotContextChip`) affiche une puce avec `Icons.my_location_rounded` + le `label` du contexte actif en haut du panneau (`screens/copilot_panel_body.dart`), invisible (`SizedBox.shrink()`) quand aucun contexte n'est actif — l'utilisateur voit toujours explicitement ce que le Copilot "sait" de l'écran courant.

## Smart Suggestions — questions de démarrage proposées automatiquement

Avant même que l'utilisateur tape quoi que ce soit, l'écran vide de la conversation (`widgets/copilot_empty_state.dart`) propose 3 à 4 questions prêtes à envoyer, adaptées à l'écran actuellement affiché — pas une liste statique identique partout.

**À ne pas confondre avec les suggestions POST-réponse déjà existantes** (`models/copilot_suggestion.dart` / `widgets/copilot_suggestion_chips.dart`, consommées via `CopilotResponse.suggestions`) : celles-là viennent du backend (`src/ai/orchestrator/suggestionEngine.js`, uniquement sur le chemin d'analyse d'attention de `ProjectAgent` aujourd'hui — voir `SMART_SUGGESTIONS.md` côté backend) et proposent une ACTION après une réponse déjà donnée (ex. "Créer une relance"). Les Smart Suggestions décrites ici sont des questions de DÉMARRAGE, calculées 100% côté client, avant tout message.

**`services/copilot_suggestion_engine.dart`** — fonction pure `List<String> starterSuggestionsFor(CopilotScreenType? screenType)`, sans dépendance réseau ni GetX, testable isolément :

| Écran (`CopilotScreenType`) | Suggestions |
|---|---|
| `dashboard` | "Quels sont mes KPI ?", "Quels projets sont critiques ?", "Montre les ventes." |
| `project` | "Résume le projet.", "Analyse les risques.", "Créer une activité.", "Créer un rapport." |
| `client` (commercial) | "Montre les devis.", "Relance les clients.", "Créer une opportunité." |
| `industrial` | "Résume la fiche.", "Vérifie la conformité.", "Analyse les diamètres." |
| aucun contexte actif (`null`) | `kDefaultCopilotSuggestions` — les 4 exemples génériques déjà utilisés avant Context Awareness, pour un écran non encore intégré. |

**Câblage** — `CopilotEmptyState` lit `CopilotContextController.to.current.value?.screenType` dans un `Obx` dédié (même contrôleur que Context Awareness, voir cette section) et appelle `starterSuggestionsFor(...)` à chaque rebuild : si l'utilisateur change d'écran alors que le panneau est déjà ouvert et qu'aucun message n'a encore été envoyé, les chips affichées changent immédiatement, sans fermer/rouvrir le panneau. Un tap envoie directement le texte via `CopilotController.to.send(prompt)` — même mécanisme que les anciens exemples statiques.

## AI Dashboard — le briefing affiché automatiquement à l'ouverture

Un 3ᵉ onglet du panneau Copilot (`CopilotPanelTab.dashboard`, voir `providers/copilot_ui_controller.dart`) — c'est l'onglet **par défaut** dès la première ouverture du panneau dans la session (`activeTab = CopilotPanelTab.dashboard.obs`) : "Bonjour {prénom} 👋", les compteurs du jour, la qualité CRM, les projets à risque, des recommandations, un graphique, une timeline et les notifications — tout affiché sans que l'utilisateur ait à poser la moindre question. Reflète 1:1 `GET /ai-copilot/dashboard` (voir `AI_COPILOT_HTTP.md`, section "AI Dashboard") — jamais une donnée calculée ou inventée côté client.

**`screens/copilot_dashboard_view.dart`** — assemble les sections dans cet ordre : greeting → "Aujourd'hui" (5 `CopilotAiCard`, dont "—" plutôt que "0" pour `urgentInterventions` quand le backend l'a mis à `null`, voir plus bas) → "Projets à risque" (`CopilotRiskCardWidget`, omis si vide) → "Recommandations" (`CopilotRecommendationCardWidget`, omis si vide) → "Aperçu" (`CopilotDashboardChart`) → "Échéances" (`CopilotTimelineView`, omis si vide) → "Notifications" (`CopilotNotificationsCard`). Piloté par `providers/copilot_dashboard_controller.dart` (`CopilotDashboardController`, même seam de test `api:` que `CopilotController`) : `load()` est idempotent par défaut (un second appel après un chargement réussi ne relance rien), `load(force: true)` recharge toujours — utilisé par le `RefreshIndicator` (glisser pour rafraîchir) et par le bouton "Réessayer" de l'état d'erreur.

**Les 6 types de cartes/widgets, chacun avec une source de données réelle précise :**

| Widget | Rôle | Source réelle |
|---|---|---|
| `widgets/copilot_ai_card.dart` (`CopilotAiCard`) | "AI Cards" — les 5 compteurs "Aujourd'hui" + Qualité CRM | `briefing.today.*` / `briefing.crmQuality.score` |
| `widgets/copilot_risk_card.dart` (`CopilotRiskCardWidget`) | "Risk Cards" — un projet critique, avec sa vraie raison (`topReason`) | `briefing.riskCards` (`ProjectAttentionAnalyzer` côté backend) |
| `widgets/copilot_recommendation_card.dart` (`CopilotRecommendationCardWidget`) | "Recommendation Cards" — une action réellement autorisée pour l'utilisateur ; un tap l'envoie comme message (`CopilotController.sendSuggestion`) et bascule sur l'onglet conversation | `briefing.recommendationCards` (même `CopilotSuggestion` que les suggestions post-réponse, voir plus haut) |
| `widgets/copilot_dashboard_chart.dart` (`CopilotDashboardChart`) | "Charts" — graphique en barres (`fl_chart`, même bibliothèque que `lib/dashboard/academic/widgets/bar_chart.dart::MiniBarChart`) des 4 mêmes compteurs, aucune nouvelle donnée | `briefing.chart` |
| `widgets/copilot_timeline_view.dart` (`CopilotTimelineView`) | "Timeline" — les mêmes éléments regroupés par échéance (Aujourd'hui/Cette semaine/Plus tard) plutôt que par catégorie | `briefing.timeline` |
| `widgets/copilot_notifications_card.dart` (`CopilotNotificationsCard`) | "Notifications" — réutilise le VRAI `NotificationController` (`lib/app_shell_route/components/topbar/`) + `NotificationListWidget` (`lib/widgets/notification/`) : mêmes données, jamais une deuxième implémentation | `NotificationController.to.{unreadCount, listOfNotification}` |

**Piège évité — `NotificationIconButton` n'est PAS réutilisé** : ce widget (déjà existant, câblé sur la barre du haut) importe `../common_imports.dart`, un fichier barrel qui tire (via `commercial_contact_list_getx_screen.dart` et consorts) des usages `dart:html` non conditionnels — cassant la compilation en cible VM/test (`flutter test`), le même problème pré-existant que celui documenté pour `test/widget_test.dart`. `CopilotNotificationsCard` compose donc directement `NotificationController` + `NotificationListWidget`, qui n'ont ni l'un ni l'autre cette dépendance — `lib/ai/` reste entièrement testable.

**`urgentInterventions` peut être `null`, jamais fabriqué en `0`** : réservé aux gestionnaires de maintenance côté backend (voir `AI_COPILOT_HTTP.md`) — `_TodayCards` affiche `"—"` plutôt que `"0"` pour ne jamais laisser croire "aucune intervention urgente" à un rôle qui n'a simplement pas le droit de voir ce chiffre.

**Piège de test — `ListView(children:)` n'inflate que les enfants visibles** : le contenu du Dashboard AI dépasse largement les 600px du viewport de test par défaut ; comme tout `ListView`, même sans `.builder`, s'appuie sur un `SliverList` paresseux, les sections en bas de page (Recommandations, Aperçu, Échéances, Notifications) ne sont jamais construites dans l'arbre de widgets si le viewport reste trop petit — `test/ai/screens/copilot_dashboard_view_test.dart` agrandit `tester.view.physicalSize` avant de chercher ce contenu, plutôt que de scroller pas à pas.

## Proactive AI — "le Copilot ne doit plus attendre une question"

Le Copilot surveille désormais Projets, Pipeline, Ventes, Maintenance, RH, Industrial et Dashboard (KPI) EN ARRIÈRE-PLAN, côté backend (cron quotidien, voir `Backend Master/src/ai/proactive/PROACTIVE_AI.md`) — et pousse une alerte réelle vers ce client dès qu'un risque est détecté, sans qu'aucune question n'ait été posée. Reflète 1:1 l'événement WebSocket `proactive-ai-alert` (voir `AI_COPILOT_HTTP.md`, section dédiée) — DÉLIBÉRÉMENT hors du namespace `ai-copilot:*` (ce n'est jamais une réponse à un message envoyé par ce client, seul le cron backend l'émet).

**`models/proactive_alert.dart`** — `ProactiveAlert {domain, subject, severity, analysis, explanation, suggestion, suggestedActions, workflow, context}` et `ProactiveWorkflow {id, label, reason, status}`. `workflow` reste `null` la plupart du temps : un bouton "Confirmer" n'est affiché QUE quand le backend a pu construire un Tool exécutable sans deviner de données (aujourd'hui : uniquement certains risques projet, voir `PROACTIVE_AI.md`) — jamais un bouton fabriqué côté client pour une action qui n'existe pas vraiment.

**`services/copilot_socket_service.dart::onProactiveAlert()`** — écoute `proactive-ai-alert` sur le MÊME `SocketService.instance` que tout le reste du Copilot. **`services/copilot_api_service.dart::confirmProactiveWorkflow()`/`rejectProactiveWorkflow()`** — `POST /ai-copilot/proactive/:workflowId/confirm|reject`.

**`providers/proactive_alerts_controller.dart`** (`ProactiveAlertsController`, GetX, `.to` singleton, seam de test `api:`/`socket:`) — câble le listener socket dans `onInit()` (jamais dans le constructeur — voir la note ci-dessous sur les tests), maintient `alerts` (les plus récentes en premier). **Toute action nécessite une validation utilisateur explicite** : `confirmWorkflow()`/`rejectWorkflow()` ne sont JAMAIS appelées automatiquement, uniquement sur tap — `confirmWorkflow()` EXÉCUTE réellement le workflow (retire l'alerte seulement en cas de succès, la garde en cas d'échec — jamais un retrait optimiste) ; `rejectWorkflow()` l'écarte sans jamais rien exécuter. `processingWorkflowIds` évite un double-tap pendant l'appel réseau.

**Câblage automatique, même quand le panneau est fermé** — `ProactiveAlertsController.to` est forcé dans `screens/copilot_panel_body.dart::CopilotPanelBody.build()` (comme `CopilotController.to`/`CopilotUiController.to`) : le listener est actif dès que le panneau existe dans l'arbre de widgets (le drawer/la feuille sont construits par `Scaffold` même fermés), jamais seulement quand l'utilisateur ouvre l'onglet Dashboard.

**`widgets/copilot_proactive_alert_card.dart`** — une carte par alerte (couleur/libellé de sévérité couvrant les 2 vocabulaires réels : `critique`/`elevee` pour les projets, `alerte`/`risque`/`anomalie` pour les domaines Dashboard IA), toujours l'explication ET la suggestion. Avec un `workflow` : 2 vrais boutons "Confirmer : {label}"/"Écarter", désactivés + spinner pendant l'appel. Sans `workflow` : un simple bouton "Fermer" (retrait local, `dismiss()`) — jamais un bouton "Confirmer" fabriqué pour une action qui n'existe pas.

**Intégré dans `screens/copilot_dashboard_view.dart`** — une section "Alertes proactives" apparaît EN HAUT du Dashboard AI (juste après le greeting, avant "Aujourd'hui") dès qu'une alerte arrive, y compris EN DIRECT pendant que l'onglet est déjà ouvert (même `Obx` que le reste du dashboard — lit `ProactiveAlertsController.to.alerts`) — jamais besoin de fermer/rouvrir le panneau pour la voir apparaître.

**Piège de test — `onInit()` ne se déclenche PAS sur une construction nue** : `ProactiveAlertsController(api:, socket:)` seul (sans `Get.put(...)`) ne câble jamais le listener — GetX n'appelle `onInit()` qu'à l'enregistrement (`Get.put`/`.to`), jamais à la construction Dart brute. Les tests doivent donc `Get.put<ProactiveAlertsController>(ProactiveAlertsController(api:, socket:))`, jamais juste `ProactiveAlertsController(api:, socket:)` — voir `test/ai/providers/proactive_alerts_controller_test.dart`.

## Expérience premium — animations, glassmorphism, responsive, accessibilité

Une passe de polish transversale, "digne de Microsoft Copilot" — s'appuie sur ce qui existait déjà (streaming, typing dots, avatar animé, dark mode déjà partout) plutôt que de le refaire, et comble les vrais manques identifiés par audit direct du code : aucun glassmorphism, un seuil responsive binaire (mobile-ou-desktop, une tablette recevait le traitement mobile), zéro `Semantics` explicite, un onglet actif reconstruit intégralement à chaque bascule.

**Responsive 3 niveaux — `theme/copilot_device_class.dart`** — `copilotDeviceClassOf(context)` dérive `CopilotDeviceClass {mobile, tablet, desktop}` des VRAIS `BreakpointName` déjà utilisés par tout le reste de l'app (`lib/constant/breakpoint.dart`), jamais un nouveau seuil inventé. Avant cette passe, `CopilotFab` ne testait qu'un seuil binaire (`largerThan(MD)`) : une tablette (577-1239px, "Tablet"/"Large Tablet Size" selon les commentaires DU FICHIER lui-même) recevait donc la MÊME feuille modale plein écran qu'un téléphone. Désormais : mobile → `CopilotChatBottomSheet` ; tablette/desktop → `CopilotChatDrawer` (panneau latéral, jamais un plein écran sur un écran assez large pour garder le CRM visible à côté) — à une largeur qui dépend elle-même de la classe d'appareil (360px tablette, 420px desktop, voir `_kTabletWidth`/`_kDesktopWidth`).

**Glassmorphism — `widgets/copilot_glass_surface.dart`** — `CopilotGlassSurface` : `BackdropFilter`/`ImageFilter.blur` + une teinte semi-transparente + une bordure claire fine, même technique déjà utilisée ailleurs dans l'app (`lib/pages/auth/widgets/auth_ui_kit.dart`) — jamais un nouveau package de flou. Appliqué au fond du drawer ET de la bottom sheet : le panneau laisse deviner le CRM derrière lui, l'esthétique "Mica" que Copilot utilise dans Windows/Edge.

**Micro-interactions — `widgets/copilot_press_scale.dart`** — `CopilotPressScale` : un léger retrait au tap-down, un retour ressort au relâchement (110ms, `Curves.easeOut`). Respecte `MediaQuery.disableAnimations` (préférence système "réduire les animations"). Appliqué aux 3 boutons d'onglet du header (`_TabIconButton`, `copilot_panel_body.dart`) — jamais au FAB lui-même : `FloatingActionButton` a déjà son propre retour visuel (ondulation Material + élévation), imbriquer un second `GestureDetector` dedans aurait fait concurrence au sien pour le geste.

**Performance — onglets construits UNE FOIS, à leur PREMIÈRE visite (`_TabbedBody`, `copilot_panel_body.dart`)** — bascule d'onglet via `IndexedStack` plutôt qu'un `switch` qui renvoyait un widget FLAMBANT NEUF à chaque fois : position de scroll et état local préservés en revenant sur un onglet déjà visité, jamais une reconstruction complète. Volontairement PAS un `IndexedStack` qui construit les 3 onglets dès l'ouverture : `CopilotConversationHistoryList` déclenche `CopilotHistoryController.to.load()` dans son `initState()` (un vrai appel réseau, sans seam de test) — le construire pour un utilisateur qui ne visite jamais "Historique" gaspillerait un appel, et casserait tout test qui monte `CopilotPanelBody` sans jamais viser cet onglet. `_visited` (un `Set<int>` local) ne construit donc le VRAI widget d'un onglet que la première fois qu'il devient actif ; un onglet jamais visité reste un `SizedBox.shrink()` dans la pile.

**Loading premium — `AnimatedSwitcher` sur `CopilotDashboardView`** — un fondu enchaîné (220ms) entre spinner → contenu (ou → erreur), clé par un `stateKey` (`'loading'|'error'|'empty'|'data'`) plutôt qu'un remplacement instantané qui "saute" à l'écran.

**Accessibilité :**
- `CopilotMessageBubble` — `Semantics(label: 'Vous avez dit : ...' | 'Le Copilot a répondu : ...')` : un lecteur d'écran doit distinguer les deux rôles, jamais juste le texte brut sans contexte. `liveRegion: true` UNIQUEMENT pendant le streaming (`message.isStreaming`) — un message déjà terminé n'est jamais ré-annoncé à chaque scroll.
- `CopilotFab` — `tooltip: 'Ouvrir le Copilot IA'` (le FAB était le seul point d'entrée du Copilot sans aucun libellé accessible).
- `_TabIconButton` — `Tooltip` + `Semantics(button: true, selected: isActive, label: ...)` explicites autour du `CopilotPressScale` (qui n'a, lui, aucune sémantique propre contrairement à `IconButton`).
- `CopilotPulseGlow` (halo pulsant derrière l'avatar) — respecte `MediaQuery.disableAnimations` : désactivé entièrement si l'utilisateur a activé "réduire les animations" au niveau système. `CopilotTypingDots`/`CopilotStreamingCursor` restent volontairement INCHANGÉS : ils communiquent un VRAI état ("le Copilot travaille encore"), pas une simple décoration — les supprimer sous "réduire les animations" retirerait une information, pas juste un effet.

## Markdown — tableaux, listes, code

**Listes/barré/liens automatiques fonctionnent sans configuration** : `flutter_markdown` utilise par défaut `md.ExtensionSet.gitHubFlavored`. **Les tableaux** sont extraits AVANT le rendu (`utils/copilot_content_parser.dart::splitCopilotContent`) et rendus par `widgets/copilot_table_view.dart` (en-tête, lignes alternées, défilement horizontal, cellules sélectionnables) : le tableau brut de `flutter_markdown` débordait dans un panneau étroit. Un texte sans tableau reste un seul `MarkdownBody`, rendu identique à avant.

**Blocs de code** (`widgets/copilot_code_block.dart`) : coloration syntaxique réelle via `flutter_highlight`/`highlight` (190 langages déjà enregistrés par défaut, aucune configuration par langage nécessaire), en-tête avec le nom du langage détecté (extrait de la classe `language-xxx` du fenced code block, voir `CopilotCodeBlockBuilder`) et un bouton "Copier" dédié au bloc.

**Piège flutter_markdown résolu** (isolé empiriquement, pas supposé — voir le commentaire de `CopilotCodeBlockBuilder.visitText()`) : dès qu'un `MarkdownElementBuilder` est enregistré pour la balise `pre`, `MarkdownBuilder.visitText()` redirige CHAQUE nœud texte de ce bloc vers ce builder au lieu de son rendu par défaut — et la méthode `visitText()` par défaut de `MarkdownElementBuilder` renvoie `null`, ce qui casse le comptage interne du package (`Failed assertion: '_inlines.isEmpty'`, plante au premier rendu). `CopilotCodeBlockBuilder` surcharge donc `visitText()` pour renvoyer un `SizedBox.shrink()` non-nul — peu importe CE qu'il renvoie, seul le fait qu'il soit non-nul compte, le contenu réel étant de toute façon entièrement reconstruit depuis `element.textContent` (l'AST) dans `visitElementAfter()`.

**Langage non spécifié → `'plaintext'`, jamais `null`** : passer `language: null` à `HighlightView` déclenche une AUTO-DÉTECTION sur les 190 langages enregistrés (`highlight.parse(source, language: null)`), qui a été identifiée comme cause d'un débordement de layout massif en pratique (`RenderFlex overflowed`) sur certaines entrées courtes. `'plaintext'` (langage réellement enregistré, voir `highlight/languages/plaintext.dart`) est utilisé à la place — l'en-tête du bloc affiche quand même "texte" pour l'utilisateur.

## Interface produit (UI v2)

Uniquement côté Flutter — aucun changement de logique backend, aucun nouveau paquet.

| Élément | Où | Remarque |
|---|---|---|
| Header | `screens/copilot_panel_body.dart::_Header` | avatar animé pendant une réponse, statut en direct (« Assistant CRM · prêt » ou la phase en cours), onglets Dashboard / Conversation / Historique, **Nouvelle conversation** |
| Messages | `widgets/copilot_message_bubble.dart` | utilisateur : bulle primaire à droite ; assistant : avatar + « Copilot IA · heure » + carte bordée |
| Markdown / code / tableaux | `copilot_message_bubble.dart`, `copilot_code_block.dart`, `copilot_table_view.dart` | titres, citations, liens, blocs de code colorés, tableaux défilants |
| Cartes KPI | `widgets/copilot_kpi_cards.dart` + `extractCopilotKpis` | uniquement les lignes « libellé : nombre » DÉJÀ présentes dans la réponse (≥ 2, ≤ 6, jamais un identifiant) — aucune valeur calculée côté client |
| Boutons d'action | `copilot_message_actions.dart` (inchangé), `copilot_suggestion_chips.dart` | copier, régénérer, PDF, suggestions |
| Confirmation | `widgets/copilot_pending_action_card.dart` | objectif, nombre d'actions, liste repliable, « Aucune action n'a encore été exécutée », un seul clic (boutons désactivés ensuite), actionnable seulement sur le dernier message |
| Fichiers | `widgets/copilot_attachment_preview.dart`, `copilot_input_bar.dart` | badge de type, nom, taille, **progression réelle** (`onSendProgress` de Dio), puis « Analyse du document… », prêt, erreur exacte |
| Loading intelligent | `widgets/copilot_loading_indicator.dart` + `utils/copilot_loading_phase.dart` | « Recherche dans le CRM… » / « Analyse du document… » / « Préparation de l'action… », déduit du message envoyé (le backend n'émet pas de phase : rien n'est inventé) ; message honnête si la réponse tarde |
| Erreurs | `copilot_message_bubble.dart::_ErrorContent` | carte d'erreur + « Réessayer » sur la dernière réponse |
| Suggestions de prompts | `widgets/copilot_empty_state.dart`, `kCopilotQuickPrompts` | 📊 projets, 👥 contacts, 📄 document (ouvre le sélecteur), 🔎 projets sans relance, 🤖 capacités — chaque question vérifiée contre le détecteur d'intentions du backend ; + « Pour cet écran » (Smart Suggestions) |
| Historique | `copilot_conversation_history_list.dart` (inchangé) | onglet Historique |

Couleurs : uniquement la palette existante (`CopilotColors` construit sur `app_color.dart`, nouveaux jetons `errorBackground`, `success`, `tableHeader`…), police `Styles.fontFamily`.

## Performance

- `ValueKey(message.id)` sur chaque `CopilotMessageBubble` (voir `CopilotPanelBody._ChatView`) — permet à Flutter de reconnaître un message déjà rendu plutôt que de tout reconstruire quand la liste change de longueur (nouveau message ajouté).
- `RepaintBoundary` autour de chaque bulle — isole le repaint : pendant le streaming, seule la bulle assistant en cours de rédaction se repeint à chaque chunk, jamais les bulles déjà complètes au-dessus dans la liste.
- Le `DraggableScrollableSheet` de la présentation mobile partage son `ScrollController` avec la liste des messages (`CopilotPanelBody.chatScrollController`) — glisser dans la conversation redimensionne aussi la feuille, sans double gestion du scroll.

## Nouvelles dépendances ajoutées

| Package | Rôle | Dev only |
|---|---|---|
| `flutter_markdown` | Rendu markdown des réponses (le projet n'avait que `flutter_html`, qui attend du HTML) | non |
| `markdown` | Déclaré explicitement bien que déjà tiré transitivement par `flutter_markdown` — utilisé directement pour l'AST (`CopilotCodeBlockBuilder`) | non |
| `flutter_highlight` + `highlight` | Coloration syntaxique des blocs de code (190 langages) | non |
| `mocktail` | Mock de `Dio`/`CopilotApiService`/`CopilotSocketService` dans les tests | oui |

## État de compte GetX — pattern dominant du projet, pas une invention

Tous les controllers (`CopilotController`, `CopilotUiController`, `CopilotHistoryController`) suivent le pattern déjà établi par `ArchiveRequestProvider`/`NotificationController` : `extends GetxController`, un accesseur statique `.to` qui fait `Get.put()` au premier appel puis `Get.find()` ensuite, état exposé en `.obs`/`Rx`, consommé via `Obx(...)`. Aucun nouveau pattern de state management introduit.

## Tests

```bash
flutter test test/ai
```

- `test/ai/models/` — sérialisation `fromJson`, cas limites (champs manquants, dates invalides), sans aucune dépendance externe.
- `test/ai/providers/copilot_ui_controller_test.dart` — état pur (ouverture/fermeture/onglets), sans réseau.
- `test/ai/providers/copilot_controller_test.dart` — `send()`/`regenerate()`/`stopGenerating()`/`copyMessage()` contre un `CopilotApiService`/`CopilotSocketService` MOCKÉS (`mocktail`, `CopilotController(api:, socket:)`, un seam de test dédié) : chemin REST complet, annulation réelle via `CancelToken` (capturé et vérifié `isCancelled`), qu'une réponse arrivant APRÈS un `stopGenerating()` est bien ignorée, que `regenerate()` remplace la bulle sans dupliquer le message utilisateur. `Clipboard.setData`/`Fluttertoast` interceptés via `setMockMethodCallHandler` — jamais un vrai presse-papiers ni une vraie notification.
- `test/ai/services/copilot_api_service_test.dart` — `Dio` mocké via `mocktail` (`CopilotApiService.withDio(dio)`) ; jamais un vrai appel réseau. Inclut la présence/absence de `pageContext` dans le corps POST selon qu'il est fourni ou non.
- `test/ai/widgets/` — rendu structurel (bulle utilisateur vs assistant, markdown, tableaux, blocs de code colorés, curseur de streaming, points de frappe, visibilité du FAB/bouton stop, règles d'affichage copier/régénérer, puce de contexte actif/inactif). Les animations qui bouclent indéfiniment (`CopilotPulseGlow`, `CopilotTypingDots`, `CopilotStreamingCursor`) sont testées avec des `pump(duration)` bornés, jamais `pumpAndSettle()` (qui attendrait indéfiniment une animation qui ne s'arrête jamais).
- `test/ai/models/copilot_page_context_test.dart` — `toJson()` des 4 fabriques contre le contrat exact attendu par `pageContextFormatter.js` côté backend, omission des champs null/vides, zéro traité comme une vraie valeur, aucun champ "commande" fabriqué en fiche industrielle quand non fourni.
- `test/ai/providers/copilot_context_controller_test.dart` — `setContext`/`clearContext`, y compris le test dédié à la garde d'identité (`clearContext(owner)` ne doit PAS effacer un contexte plus récent posé par un autre écran).
- `test/ai/providers/copilot_controller_test.dart`, groupe "Context Awareness" — absence de contexte → `pageContext` absent du payload ; contexte projet actif → transmis tel quel (REST et WebSocket) ; changement de contexte EN COURS de conversation → reflété dès le tour suivant ; `clearContext()` → retour à `null`.
- `test/ai/services/copilot_suggestion_engine_test.dart` — les 4 écrans renvoient bien leur liste exacte de suggestions, le cas `null` retombe sur `kDefaultCopilotSuggestions`, aucune suggestion vide/dupliquée entre écrans.
- `test/ai/widgets/copilot_empty_state_test.dart` — les chips affichées correspondent au contexte actif (dashboard/project/client/industrial/aucun), et se mettent à jour dès `setContext()` sans reconstruire le widget (`CopilotEmptyState(context:)`, même seam de test que `CopilotController`).
- **Proactive AI** — `test/ai/models/proactive_alert_test.dart` (parsing, `workflow` reste `null` quand absent, `receivedAt` généré côté client), `test/ai/services/copilot_api_service_test.dart` (`confirmProactiveWorkflow`/`rejectProactiveWorkflow`), `test/ai/providers/proactive_alerts_controller_test.dart` (câblage du listener via `Get.put(...)` — voir le piège de test documenté plus haut —, alertes les plus récentes en premier, `confirmWorkflow`/`rejectWorkflow` n'exécutent RIEN sans workflow, un échec garde l'alerte au lieu de la retirer), `test/ai/widgets/copilot_proactive_alert_card_test.dart` (boutons Confirmer/Écarter uniquement avec un workflow, spinner + désactivation pendant l'appel, jamais un double-tap).
- **Expérience premium** — `test/ai/widgets/copilot_glass_surface_test.dart` (un vrai `BackdropFilter`, jamais un flou en trompe-l'œil), `test/ai/widgets/copilot_press_scale_test.dart` (scale au tap-down/relâchement/annulation, jamais de scale si `disableAnimations`), `test/ai/theme/copilot_device_class_test.dart` (les 3 classes + les 2 frontières exactes 905/1240 — fournit `ResponsiveBreakpointsData` directement via son propre `InheritedWidget` plutôt que de simuler une taille de fenêtre : le widget `rf.ResponsiveBreakpoints` recalcule via `WidgetsBindingObserver`/`didChangeMetrics`, peu fiable à synchroniser dans un simple `pumpWidget()`), `test/ai/screens/copilot_panel_body_test.dart` (onglet Dashboard par défaut, bascule via les boutons du header, barre de saisie uniquement en onglet chat, ET — le test qui aurait échoué avant le passage au chargement "à la première visite" — revisiter Dashboard après être passé par Conversation ne refait PAS d'appel réseau).
- **AI Dashboard** — `test/ai/models/copilot_dashboard_briefing_test.dart` (parsing de toutes les sections, `urgentInterventions`/`topReason` restent `null` plutôt que fabriqués), `test/ai/services/copilot_api_service_test.dart` (`getDashboardBriefing()`), `test/ai/providers/copilot_dashboard_controller_test.dart` (`load()` idempotent, `force: true`, erreurs jamais affichées brutes), `test/ai/providers/copilot_ui_controller_test.dart` (`showDashboard()`, onglet par défaut), `test/ai/widgets/copilot_ai_card_test.dart`, `copilot_risk_card_test.dart`, `copilot_recommendation_card_test.dart` (tap → `sendSuggestion` + bascule d'onglet), `copilot_dashboard_chart_test.dart`, `copilot_timeline_view_test.dart`, `copilot_notifications_card_test.dart`, et `test/ai/screens/copilot_dashboard_view_test.dart` (chargement/erreur/retry de bout en bout, seam `controller:`).

**Point d'attention pour tout nouveau test qui rend un widget dépendant de `CopilotController.to`** (directement ou via `CopilotMessageActions`/`CopilotInputBar`) : le constructeur de `CopilotController` construit `AuthService()` (singleton réel de l'app), qui construit `GetStorage()`, qui appelle `path_provider` en interne — sans un `setMockMethodCallHandler` sur le canal `plugins.flutter.io/path_provider` dans `setUpAll` (voir le motif répété dans `copilot_controller_test.dart`/`copilot_input_bar_test.dart`/`copilot_message_actions_test.dart`/`copilot_message_bubble_test.dart`), l'initialisation asynchrone de `GetStorage` échoue silencieusement puis fait remonter une `MissingPluginException` non rattrapée qui casse un test déjà terminé.

**Non testé dans cette passe** (limite assumée, comme documenté côté backend pour des zones équivalentes) : le flux WebSocket complet de bout en bout (typing → chunks → complete relayés par `CopilotSocketService`/`SocketService.instance`/`socket_io_client` réels) n'a aucun test — ni `CopilotSocketService` elle-même, ni `SocketService` (qui n'avait déjà aucun test dans ce projet avant cette passe). Les tests de `CopilotController` forcent systématiquement `socket.isConnected => false` pour exercer le chemin REST, le seul entièrement mockable ici.

## Vérification statique

```bash
flutter analyze lib/ai
```

0 avertissement/erreur sur `lib/ai/` et sur la modification de `app_shell.dart` (vérifié — voir aussi `flutter analyze` sur tout le projet : les ~1000 problèmes préexistants restants sont tous hors de `lib/ai/`, non introduits par cette passe).
