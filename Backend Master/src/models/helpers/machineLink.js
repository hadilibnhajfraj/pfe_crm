"use strict";

const { parseMachineRef, formatMachineCode } = require("../../utils/machineRef");

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Relie une fiche de production (IndustrialRecord, PorPromesh,
// RecuperableFiche) à sa ligne du référentiel `machines`.
//
// Le champ texte `machine` reste la valeur échangée avec l'API, les écrans
// Flutter et les outils du Copilot ("1".."4") ; `machineId` en est dérivé
// ici, côté serveur, à chaque création et à chaque changement de machine —
// jamais saisi par le client. Toutes les écritures de ces modèles passent
// par Model.create()/instance.update(), donc par ce hook (aucun
// Model.update()/bulkCreate en masse sur ces tables).
//
// `resolveContext(instance)` → { defaultType, strict } :
//   - defaultType : type de machine d'une valeur purement numérique
//     (null = une valeur numérique seule ne désigne aucune machine) ;
//   - strict : une valeur renseignée DOIT correspondre à une machine
//     existante (400 sinon) ; en non-strict, le texte libre est conservé
//     et machineId reste null.
// Une machine INACTIVE ne peut jamais être affectée à une fiche (création
// ou changement de machine) ; les fiches existantes gardent leur lien.
function attachMachineLink(Model, resolveContext) {
  Model.addHook("beforeSave", "linkMachine", async (instance, options) => {
    const relevant = ["machine", "machineId", "module"].some((f) => instance.changed(f));
    if (!instance.isNewRecord && !relevant) return;

    const { defaultType = null, strict = false } = resolveContext(instance) || {};
    const raw = instance.get("machine");
    const hasValue = raw != null && String(raw).trim() !== "";
    const ref = parseMachineRef(raw, defaultType);

    if (!ref) {
      if (strict && hasValue) throw httpError(400, `Machine « ${raw} » invalide.`);
      instance.set("machineId", null);
      return;
    }

    // Chargé ici (et non en tête de fichier) : ce helper est requis par les
    // modèles eux-mêmes, avant que associations.js ne soit exécuté.
    const Machine = require("../Machine");
    const machine = await Machine.findOne({
      where: { typeMachine: ref.typeMachine, numero: ref.numero },
      transaction: options.transaction,
    });

    if (!machine) {
      if (strict) {
        throw httpError(400, `Machine ${formatMachineCode(ref.typeMachine, ref.numero)} inconnue du référentiel.`);
      }
      instance.set("machineId", null);
      return;
    }

    if (machine.statut !== "ACTIVE") {
      throw httpError(400, `La machine ${machine.code} est désactivée : aucune fiche ne peut lui être affectée.`);
    }

    instance.set("machineId", machine.id);
  });
}

module.exports = { attachMachineLink };
