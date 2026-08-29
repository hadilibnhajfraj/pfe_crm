"use strict";

const { IEventBus } = require("./eventBus.interface");
const { InMemoryEventBus } = require("./inMemoryEventBus");

module.exports = { IEventBus, InMemoryEventBus };
