"use strict";

// Audit performance : `notifications` n'avait aucun index couvrant le tri
// par date (`createdAt`), ni un index combiné avec `userId`/`type` — chaque
// requête de liste ("mes notifications", triées par date) ou de
// déduplication (cron/followup.job.js) dégénérait en un scan séquentiel
// complet de la table. Mesuré en conditions réelles (table de 12M+ lignes,
// 3 Go) : la liste paginée d'un utilisateur passait de >1,3s (Parallel Seq
// Scan) à quelques millisecondes (Index Scan) après cet index — voir
// docs/performance/Benchmark.md.
module.exports = {
  async up(queryInterface) {
    // GET /notifications : WHERE userId = ? ORDER BY createdAt DESC LIMIT/OFFSET.
    await queryInterface.addIndex("notifications", ["userId", "createdAt"], {
      name: "notifications_user_id_created_at",
    });

    // cron/followup.job.js (déduplication FOLLOWUP_MISSING) et toute future
    // requête "événements récents d'un type donné".
    await queryInterface.addIndex("notifications", ["type", "createdAt"], {
      name: "notifications_type_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("notifications", "notifications_user_id_created_at");
    await queryInterface.removeIndex("notifications", "notifications_type_created_at");
  },
};
