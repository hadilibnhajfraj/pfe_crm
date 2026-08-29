"use strict";

const { EventEmitter } = require("events");
const { IEventBus } = require("./eventBus.interface");

// Default adapter: process-local pub/sub only. Deliberately not durable —
// the backend runs as a single Node process with no Redis/queue (see
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §2, §4.2). Swap this adapter
// behind IEventBus, not its consumers, if a durable bus is introduced later.
class InMemoryEventBus extends IEventBus {
  constructor() {
    super();
    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(50);
  }

  publish(eventName, payload) {
    this._emitter.emit(eventName, payload);
  }

  subscribe(eventName, handler) {
    this._emitter.on(eventName, handler);
  }

  unsubscribe(eventName, handler) {
    this._emitter.off(eventName, handler);
  }
}

module.exports = { InMemoryEventBus };
