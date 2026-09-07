const { EventEmitter } = require('events');

// In-memory only — fine for a booth demo, no persistence needed across restarts.
const cases = new Map(); // call_id -> case record
const escalationQueue = [];
const bus = new EventEmitter();

function createCase(callId, record) {
  cases.set(callId, { call_id: callId, status: 'initiated', ...record });
  return cases.get(callId);
}

function updateCase(callId, patch) {
  const existing = cases.get(callId) || { call_id: callId };
  const updated = { ...existing, ...patch };
  cases.set(callId, updated);
  bus.emit(`update:${callId}`, updated);
  return updated;
}

function getCase(callId) {
  return cases.get(callId);
}

function addEscalation(entry) {
  escalationQueue.push(entry);
  bus.emit('escalation', entry);
  return entry;
}

function listEscalations() {
  return escalationQueue;
}

module.exports = { bus, createCase, updateCase, getCase, addEscalation, listEscalations };
