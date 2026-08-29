"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: lets AI components publish/subscribe to events without knowing
// about Socket.IO, cron, or each other (Dependency Inversion — consumers
// depend on this abstraction, not on InMemoryEventBus directly).
class IEventBus {
  publish(_eventName, _payload) {
    throw new NotImplementedError("IEventBus", "publish");
  }

  subscribe(_eventName, _handler) {
    throw new NotImplementedError("IEventBus", "subscribe");
  }

  unsubscribe(_eventName, _handler) {
    throw new NotImplementedError("IEventBus", "unsubscribe");
  }
}

module.exports = { IEventBus };
