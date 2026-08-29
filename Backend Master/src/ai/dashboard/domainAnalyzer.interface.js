"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: analyzes ONE business domain (projets/pipeline/ventes/maintenance/
// RH/industriel/KPI) and produces the 6 requested insight categories. As
// opposed to IAutomation (system/scheduler-triggered actions) and IAgent
// (one conversational turn), an IDomainAnalyzer only ever READS — nothing
// under src/ai/dashboard/ ever calls a Tool that mutates CRM data (see
// test/ai.dashboard.policy.test.js).
class IDomainAnalyzer {
  get domain() {
    throw new NotImplementedError("IDomainAnalyzer", "domain");
  }

  async analyze(_context) {
    throw new NotImplementedError("IDomainAnalyzer", "analyze");
  }
}

module.exports = { IDomainAnalyzer };
