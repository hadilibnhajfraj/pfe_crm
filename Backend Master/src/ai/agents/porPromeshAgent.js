"use strict";

const { BaseAgent } = require("./baseAgent");
const {
  detectIndustrialRequest,
  isFicheCreationFollowUp,
  buildAmbiguousAnswer,
  buildCountAnswer,
  buildAnalysisAnswer,
  runGuidedCreation,
  INDUSTRIAL_CREATION_TYPE,
  PROMESH_CREATION_TYPE,
} = require("../reasoning/industrialRequest");
const { AgentError } = require("./errors");
const { tokenize } = require("../utils/tokenize");

// Les 10 Tools du module POR PROMESH (voir mcp/tools/porPromesh/) —
// addAttachment/getPorPromeshPdf volontairement absents du module Tools
// lui-même (upload/sortie binaire, hors périmètre MCP JSON — voir
// mcp/tools/porPromesh/index.js). Le rapport d'audit précédent en comptait
// 9 ("AUDIT ET CONCEPTION DES AGENTS PAR RÔLE") — recompté ici : il y en a
// bien 10, `create_or_open_por_promesh_draft` avait été omis du décompte.
const ALLOWED_TOOL_NAMES = [
  "list_por_promesh",
  "get_por_promesh",
  "create_por_promesh",
  "create_or_open_por_promesh_draft",
  "update_por_promesh",
  "delete_por_promesh",
  "validate_por_promesh",
  "get_por_promesh_stats",
  "get_por_promesh_dashboard",
  "list_por_promesh_operators",
];

// Identique au requiredRoles (READ_WRITE_ROLES) déclaré par CHAQUE Tool de
// ce module (voir mcp/tools/porPromesh/*.js) — aucun Tool POR PROMESH n'est
// ouvert à un rôle hors de cet ensemble ; `delete_por_promesh` exige un
// sous-ensemble plus étroit (DELETE_ROLES = admin-tier seul), déjà appliqué
// par le Tool lui-même, jamais élargi ni court-circuité ici — même
// discipline que IndustrialAgent.
const REQUIRED_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// Mission "RÈGLES DE RÉPONSE — POR PROMESH" — remplace le prompt court
// d'origine par une spécification complète de présentation (format, emojis,
// priorités) fournie explicitement par l'utilisateur. Préservé en template
// littéral multi-lignes (plutôt que le `.join(" ")` habituel des autres
// Agents) car la structure (titres, listes, gabarits d'exemple) fait partie
// intégrante de l'instruction — l'aplatir en un seul paragraphe en
// détruirait le sens pour le modèle. Une validation (verrouillage) reste
// irréversible (règle métier déjà en vigueur, reprise ci-dessous) :
// confirme toujours avant de valider une fiche.
const SYSTEM_PROMPT = `Tu es l'assistant métier POR PROMESH de la plateforme Probar.

Ta mission est de répondre aux demandes concernant les fiches de production POR PROMESH en utilisant les outils disponibles.

### INTERDICTION ABSOLUE DES BALISES HTML

Ne génère JAMAIS de balises HTML dans une réponse, notamment : <br>, <p>, <div>, <table>, <tr>, <td>, <b>, <strong>, <ul>, <li>. Utilise exclusivement du texte et du Markdown simple (titres, listes à puces, gras) compatible avec l'affichage actuel du Copilot — jamais une seule ligne concaténée avec des <br> à la place de retours à la ligne.

### RÈGLE 1 — UTILISATION OBLIGATOIRE DES DONNÉES

Lorsqu'un utilisateur demande des fiches, productions, enregistrements ou informations POR PROMESH :

- utilise obligatoirement l'outil \`list_por_promesh\` lorsque la demande nécessite des données métier ;
- ne fabrique jamais une fiche ;
- ne devine jamais une valeur absente du résultat de l'outil ;
- ne modifie jamais les valeurs retournées par l'outil ;
- n'invente jamais de date, opérateur, machine, production ou conformité.

La réponse doit être basée exclusivement sur les données réellement retournées par l'outil. Une validation (verrouillage) est irréversible : confirme toujours avant de valider une fiche.

### RÈGLE 2 — PRÉSENTATION

Ne présente jamais une fiche POR PROMESH sous la forme d'un long paragraphe lorsque plusieurs champs structurés sont disponibles. Ne mets jamais toutes les informations dans un seul paragraphe.

Présente les résultats de manière claire, professionnelle et facilement lisible : titre clair, informations principales, regroupées par catégorie, sur des lignes séparées, avec des emojis simples et du Markdown simple — jamais de balise HTML (voir INTERDICTION ABSOLUE DES BALISES HTML ci-dessus).

Pour une seule fiche, regroupe les informations par catégorie courte, de façon compacte (un titre de catégorie suivi des valeurs, sans transformer chaque champ en liste à puces si cela allonge inutilement la fiche), avec ce format :

📋 **FICHES POR PROMESH**

**1 fiche trouvée**

🏭 **Fiche de production #<numéro de séquence>**

📅 **Date**
<date>

🕐 **Horaires**
Début : <heure début>
Fin : <heure fin>

👷 **Production**
Opérateur : <opérateur>
Machine : <machine>
Poste : <poste>
Production : <production> m²

📐 **Caractéristiques**
Maille 1 : <valeur>
Maille 2 : <valeur>

✅ **Contrôle qualité**
Conformité : <valeur>
Statut : <valeur>

🆔 **Identifiant**
<UUID>

Le numéro de séquence est l'identifiant métier principal lorsqu'il existe (titre de la fiche) — l'UUID technique reste secondaire, toujours affiché dans sa propre catégorie à la toute fin, jamais au début. N'affiche que les catégories dont au moins un champ est réellement présent dans le résultat du Tool. N'affiche jamais systématiquement les détails techniques internes (controlesQualite, processControl, structures JSON, noms internes de propriétés, explications sur le fonctionnement du Tool) sauf si l'utilisateur les demande explicitement.

### RÈGLE 3 — PLUSIEURS FICHES

Si plusieurs fiches sont retournées :

📋 **FICHES POR PROMESH**

**<nombre> fiche(s) trouvée(s)**

Puis affiche chaque fiche séparément, séparées par une ligne "---" :

### 🏭 Fiche #1
📅 Date : <date>
👷 Opérateur : <opérateur>
⚙️ Machine : <machine>
🌙 Poste : <poste>
📐 Production : <production>
✅ Conformité : <conformité>

---

### 🏭 Fiche #2
📅 Date : <date>
👷 Opérateur : <opérateur>
⚙️ Machine : <machine>
🌙 Poste : <poste>
📐 Production : <production>
✅ Conformité : <conformité>

...

Pour plusieurs fiches, n'affiche que ces 6 champs par fiche (jamais tous les champs techniques) si cela rend la réponse excessivement longue — ne répète pas inutilement les mêmes informations, et n'affiche pas systématiquement les détails techniques internes (controlesQualite, processControl, structures JSON) sauf demande explicite.

### RÈGLE 4 — CHAMPS ABSENTS

Si une information n'est pas retournée par l'outil :

- ne l'invente pas ;
- ne crée pas une valeur vide artificielle ;
- indique simplement \`Non renseigné\` uniquement si cela améliore réellement la compréhension.

Exemple :

⚙️ **Machine :** Non renseignée

### RÈGLE 5 — ID

L'identifiant technique peut être affiché, mais il ne doit pas être présenté comme l'information principale.

Pour une réponse destinée à un utilisateur métier, privilégie :

- date ;
- opérateur ;
- machine ;
- poste ;
- quantité produite ;
- conformité ;
- numéro ou séquence de production.

L'UUID complet doit être affiché uniquement lorsque cela est utile — et toujours à la fin de la fiche, jamais au début de la réponse.

### RÈGLE 6 — RÉSUMÉ

Après les fiches, ajoute un résumé court uniquement lorsque plusieurs résultats sont retournés.

Exemple :

📊 **Résumé**

- **Fiches trouvées :** 5
- **Production totale :** <valeur calculée uniquement si les données permettent réellement le calcul>
- **Conformes :** <nombre>
- **Non conformes :** <nombre>

Ne calcule jamais une statistique si les données nécessaires ne sont pas disponibles.

### RÈGLE 7 — SOURCE

Ne dis pas systématiquement : "Ces informations proviennent de l'outil list_por_promesh." Cette information est technique et n'est pas nécessaire dans chaque réponse.

Si l'utilisateur demande pourquoi ou comment la réponse a été obtenue, explique alors que les données ont été récupérées depuis l'outil métier POR PROMESH.

### RÈGLE 8 — LANGUE

Réponds dans la langue utilisée par l'utilisateur. Si l'utilisateur écrit en français, réponds en français.

### RÈGLE 9 — CONCISION

Ne transforme pas une demande simple en longue explication.

Pour "Donne-moi les fiches POR PROMESH", réponds directement avec les fiches.

Pour "Donne-moi la fiche POR PROMESH du 24/08", retourne uniquement les fiches correspondant aux données réellement disponibles.

### RÈGLE 10 — FIABILITÉ

La priorité est :

1. exactitude des données ;
2. utilisation réelle du Tool ;
3. respect des permissions ;
4. présentation claire ;
5. concision.

Le style ne doit jamais prendre le dessus sur l'exactitude.

### RÈGLE 11 — CRITÈRES DE RECHERCHE

Lorsqu'une demande contient un critère de recherche explicite, respecte ce critère en appelant list_por_promesh avec le(s) paramètre(s) réellement supporté(s) :

- date exacte (ex. "du 24/08") → paramètre 'date' ;
- machine (ex. "Machine 1") → paramètre 'machine' ;
- poste (matin/nuit) → paramètre 'poste' ;
- statut brouillon/validé → paramètre 'status' ("BROUILLON" ou "VALIDE").

Pour un critère que list_por_promesh ne permet pas de filtrer précisément côté serveur (opérateur, identifiant partiel, période/plage de dates, conformité) : utilise le paramètre 'search' s'il est pertinent, obtiens la liste la plus proche possible, puis indique clairement à l'utilisateur que le résultat n'est pas un filtre exact sur ce critère plutôt que de prétendre l'avoir appliqué.

Ne prétends jamais avoir filtré les résultats selon un critère que le Tool ne permet pas réellement d'appliquer.`;

// Mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
// PROBAR" — reproduit en direct : "donner moi tous les fiche PRO PROMESH"
// (correctement routé vers por_promesh_agent) a répondu "Aucune fiche POR
// PROMESH n'a été trouvée avec le terme 'PRO PROMESH'" — le LLM avait appelé
// list_por_promesh({search:"PRO PROMESH"}), un filtre texte inutile pour une
// demande "TOUTES les fiches" (aucune fiche réelle ne contient jamais
// littéralement "PRO PROMESH" dans un champ recherché par `search`, voir
// porPromesh.repository.js::searchClause — operateur/responsable1/
// responsable2/id/dateProduction uniquement). Un chemin déterministe
// (jamais le LLM) pour "toutes les fiches"/"liste"/"quelles sont les
// fiches" SANS critère de filtre réel mentionné élimine cette classe
// d'échec — même architecture que ProjectAgent::_runStatusQuery/
// CommercialAgent::_runContactListQuery.
//
// Signaux de FILTRE RÉEL supportés par list_por_promesh (RÈGLE 11 du
// SYSTEM_PROMPT ci-dessus) — leur présence signifie une demande CIBLÉE,
// jamais "toutes les fiches" : laissée au chemin générique (LLM +
// requireToolUse), qui sait déjà construire le bon `input`.
const FILTER_SIGNAL_WORDS = ["machine", "matin", "nuit", "poste", "brouillon", "valide", "validée", "validee", "statut"];
const DATE_SIGNAL_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;

// "Crée une fiche PROMESH" / "modifie la fiche.../supprime..." mentionnent
// aussi "fiche" sans aucun des signaux de filtre ci-dessus : sans cette
// garde, le chemin déterministe "toutes les fiches" les intercepterait à
// tort. Ces verbes d'écriture laissent TOUJOURS le chemin générique gérer
// la demande (create_por_promesh/update_por_promesh/delete_por_promesh/
// validate_por_promesh, tous inchangés par cette mission).
const WRITE_VERB_WORDS = ["cree", "crée", "créer", "creer", "ajoute", "ajouter", "modifie", "modifier", "supprime", "supprimer", "valider"];

// "fiche(s) [PROMESH] [n°/numéro] <chiffres>" — jamais un autre nombre du
// message (une date comme "24/08" a déjà été exclue par DATE_SIGNAL_RE
// avant que ce chemin ne soit atteint, voir _run()).
const SEQUENCE_NUMBER_RE = /\bfiche\S*\s+(?:promesh\s+)?(?:n[o°]?\s*|num[eé]ro\s+)?(\d{1,6})\b/i;

/**
 * PorPromeshAgent — prend en charge l'intention `por_promesh` (mission
 * "IMPLÉMENTER HRAgent ET PorPromeshAgent", priorité P1 du rapport d'audit
 * précédent).
 *
 * `responsable_logistique_achat` ne voit/modifie que SES PROPRES fiches
 * (`porPromesh.service.js::isOwnerScoped()` — vrai uniquement pour ce rôle,
 * jamais pour admin-tier, qui voit tout) — déjà appliqué dans le service,
 * jamais recalculé ici, même discipline que `scopeInputForActingUser()`
 * pour Projects. Les 2 chemins déterministes ci-dessous (liste complète /
 * fiche par numéro de séquence) appellent `list_por_promesh` SANS jamais lui
 * passer `createdBy`/`ownerId`/`userId`/`role` — le Tool résout seul le
 * périmètre RBAC depuis `actingUser`, exactement comme pour une demande
 * générique passée par le LLM.
 */
class PorPromeshAgent extends BaseAgent {
  constructor({ pendingActionStore = null, ...rest }) {
    super(rest);
    this.pendingActionStore = pendingActionStore;
  }

  async _run({ message, user, conversationId }) {
    const pending = this.pendingActionStore ? this.pendingActionStore.peek(conversationId) : null;
    const creating = Boolean(pending && pending.type === PROMESH_CREATION_TYPE && pending.actingUserId === user.id);
    const request = detectIndustrialRequest(message);

    if (creating && isFicheCreationFollowUp(message)) {
      return this._runCreation(message, user, conversationId);
    }
    if (request && (request.module === "promesh" || !request.module)) {
      if (request.operation === "ambiguous") return { answer: buildAmbiguousAnswer(["promesh"]), citations: [], toolSteps: [] };
      // « Je veux saisir une fiche PROMESH » : guidée, jamais une liste, jamais un appel incomplet.
      if (request.operation === "create") return this._runCreation(message, user, conversationId);
      if (request.operation === "count") return this._runCount();
      if (request.operation === "analysis") return this._runAnalysis();
      // « Affiche l'historique PROMESH » (sans le mot « fiche ») : la liste.
      if (request.operation === "list") return this._runAllFichesQuery();
    }
    if (!this._looksLikeFilteredQuery(message)) {
      const sequenceNumber = this._extractSequenceNumber(message);
      if (sequenceNumber !== null) {
        return this._runSequenceLookup(sequenceNumber);
      }
      if (this._looksLikeFichesQuery(message)) {
        return this._runAllFichesQuery();
      }
    }
    return super._run({ message, user, conversationId });
  }

  _looksLikeFilteredQuery(message) {
    if (DATE_SIGNAL_RE.test(message)) return true;
    const terms = new Set(tokenize(message));
    return FILTER_SIGNAL_WORDS.some((w) => terms.has(w)) || WRITE_VERB_WORDS.some((w) => terms.has(w));
  }

  _extractSequenceNumber(message) {
    const m = message.match(SEQUENCE_NUMBER_RE);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isInteger(n) ? n : null;
  }

  // "fiche(s)" au singulier OU pluriel — même garde que le mot-clé réel du
  // catalogue d'intentions (voir intentCatalog.js) : si le message a atteint
  // cet Agent (intention por_promesh déjà sélectionnée), toute mention de
  // "fiche(s)" sans critère de filtre réel (voir _looksLikeFilteredQuery
  // ci-dessus, déjà exclu avant d'arriver ici) signifie "toutes les fiches".
  _looksLikeFichesQuery(message) {
    const terms = new Set(tokenize(message));
    return terms.has("fiche") || terms.has("fiches");
  }

  _findRealTool(name) {
    return this._allowedTools().find((t) => t.name === name) || null;
  }

  async _fetchAllFiches() {
    const tool = this._findRealTool("list_por_promesh");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "list_por_promesh" Tool available.`);
    }
    const rawOutput = await tool.invoke({});
    // Forme RÉELLE vérifiée (porPromesh.service.js::listPorPromesh) :
    // {data, total} — jamais devinée.
    const { data, total } = JSON.parse(rawOutput);
    const list = Array.isArray(data) ? data : [];
    return { list, total: typeof total === "number" ? total : list.length };
  }

  async _runCount() {
    const { list, total } = await this._fetchAllFiches();
    const byStatus = new Map();
    for (const f of list) byStatus.set(f.status || "sans statut", (byStatus.get(f.status || "sans statut") || 0) + 1);
    const breakdown = list.length === total && total ? ["Par statut :", ...[...byStatus.entries()].map(([k, n]) => `• ${k} : ${n}`)] : null;
    return { answer: buildCountAnswer("promesh", total, breakdown), citations: [], toolSteps: [{ tool: "list_por_promesh", input: {}, output: { total, read: list.length } }] };
  }

  async _runAnalysis() {
    const { list, total } = await this._fetchAllFiches();
    return {
      answer: buildAnalysisAnswer({ module: "promesh", list, total, keys: { date: "dateProduction", quantity: "productionM2", quantityUnit: "m²", quality: "conformite", status: "status" } }),
      citations: [],
      toolSteps: [{ tool: "list_por_promesh", input: {}, output: { total, read: list.length } }],
    };
  }

  // Création guidée : machine et poste sont les deux champs exigés par
  // create_or_open_por_promesh_draft ; l'opérateur est le compte connecté, la
  // date et l'heure sont posées par le service, le numéro de séquence par la base.
  async _runCreation(message, user, conversationId) {
    const tool = this._findRealTool("create_or_open_por_promesh_draft");
    if (!tool) {
      throw new AgentError(`Agent "${this.name}" has no "create_or_open_por_promesh_draft" Tool available.`);
    }
    return runGuidedCreation({
      agent: this,
      store: this.pendingActionStore,
      type: PROMESH_CREATION_TYPE,
      module: "promesh",
      required: ["machine", "poste"],
      optionalNote: "La fiche sera ouverte en brouillon, à votre nom, à la date et à l'heure du moment ; le numéro de séquence est attribué automatiquement. Si un brouillon existe déjà pour cette machine et ce poste, il est rouvert.",
      tool,
      toolName: "create_or_open_por_promesh_draft",
      toToolInput: (fields) => ({ machine: fields.machine, poste: fields.poste }),
      describeResult: (output) => {
        const fiche = (output && (output.fiche || output.data || output)) || {};
        const parts = [fiche.sequenceNumber != null ? `Séquence ${fiche.sequenceNumber}` : null, fiche.status ? `statut ${fiche.status}` : null].filter(Boolean);
        return parts.length ? `${parts.join(" — ")}. Vous pouvez la compléter depuis l'écran PROMESH.` : "Vous pouvez la compléter depuis l'écran PROMESH.";
      },
      message,
      user,
      conversationId,
    });
  }

  async _runAllFichesQuery() {
    const { list, total } = await this._fetchAllFiches();
    return {
      answer: this._buildFichesListAnswer(list, total),
      citations: [],
      toolSteps: [{ tool: "list_por_promesh", input: {}, output: `${list.length}/${total} fiche(s)` }],
    };
  }

  async _runSequenceLookup(sequenceNumber) {
    const { list } = await this._fetchAllFiches();
    const fiche = list.find((f) => f.sequenceNumber === sequenceNumber);
    return {
      answer: this._buildFicheDetailAnswer(sequenceNumber, fiche),
      citations: [],
      toolSteps: [{ tool: "list_por_promesh", input: {}, output: fiche ? `fiche #${sequenceNumber} trouvée` : `fiche #${sequenceNumber} introuvable` }],
    };
  }

  _buildFichesListAnswer(list, total) {
    if (total === 0) {
      return "Aucune fiche PROMESH n'a été trouvée.";
    }
    const shown = list.length;
    const lines = [`📋 Fiches PROMESH — ${total} résultat(s)${shown < total ? ` (${shown} affiché(s) ici)` : ""}`, ""];
    list.forEach((f) => {
      const date = f.dateProduction ? new Date(f.dateProduction).toLocaleDateString("fr-FR") : "date non renseignée";
      const machine = f.machine ? `Machine ${f.machine}` : "machine non renseignée";
      lines.push(`${f.sequenceNumber != null ? `Séquence ${f.sequenceNumber}` : "Séquence non renseignée"} — ${date} — ${machine}`);
    });
    if (total > shown) lines.push("", `... et ${total - shown} autre(s) fiche(s) non affichée(s) ici.`);
    lines.push("", "Vous voulez que je vous affiche toutes les informations détaillées d'une fiche précise (ex. « détaille la fiche 156 ») ?");
    return lines.join("\n");
  }

  _buildFicheDetailAnswer(sequenceNumber, f) {
    if (!f) {
      return `Aucune fiche PROMESH n'a été trouvée avec le numéro de séquence ${sequenceNumber}.`;
    }
    const date = f.dateProduction ? new Date(f.dateProduction).toLocaleDateString("fr-FR") : "Non renseignée";
    const lines = [
      `📋 Fiche PROMESH trouvée : 1`,
      "",
      `1. Séquence : ${f.sequenceNumber}`,
      `   Date : ${date}`,
    ];
    if (f.operateur) lines.push(`   Opérateur : ${f.operateur}`);
    if (f.machine) lines.push(`   Machine : ${f.machine}`);
    if (f.poste) lines.push(`   Poste : ${f.poste}`);
    if (f.productionM2 != null) lines.push(`   Production : ${f.productionM2}`);
    if (f.status) lines.push(`   Statut : ${f.status}`);
    lines.push("", "Vous voulez que je vous affiche toutes les informations détaillées ?");
    return lines.join("\n");
  }
}

function createPorPromeshAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null, pendingActionStore = null }) {
  return new PorPromeshAgent({
    pendingActionStore,
    name: "por_promesh_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["por_promesh"],
    requiredRoles: REQUIRED_ROLES,
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
    // AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — reproduit en
    // direct contre Ollama/qwen3:8b (mission "diagnostiquer pourquoi
    // por_promesh_agent échoue") : pour "donner moi les fiches produites
    // PROMESH", le modèle a renvoyé un final_answer dès le premier tour
    // (toolCalls: [], completion=75 tokens) sans jamais appeler
    // list_por_promesh — le même mode de défaillance déjà documenté pour
    // project_agent (voir projectAgent.js::createProjectAgent). L'entière
    // raison d'être de cet Agent est de rapporter des données POR PROMESH
    // réelles exclusivement via ses Tools (voir SYSTEM_PROMPT ci-dessus),
    // donc un final_answer non fondé sur un vrai appel d'outil n'y est
    // jamais légitime — même discipline symétrique que project_agent. Ne
    // couvre que le chemin générique résiduel : les 2 chemins déterministes
    // ci-dessus (PorPromeshAgent::_run) n'appellent jamais le LLM.
    requireToolUse: true,
  });
}

module.exports = { createPorPromeshAgent, PorPromeshAgent, ALLOWED_TOOL_NAMES, REQUIRED_ROLES, SYSTEM_PROMPT };
