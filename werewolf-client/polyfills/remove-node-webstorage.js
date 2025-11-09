'use strict';

function removeWebStorage(name) {
  if (typeof globalThis === 'undefined') {
    return;
  }

  if (!(name in globalThis)) {
    return;
  }

  const candidate = globalThis[name];
  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  ) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (descriptor?.configurable) {
    delete globalThis[name];
    return;
  }

  try {
    globalThis[name] = undefined;
  } catch (error) {
    // noop - best effort only
  }
}

function ensureSlowBuffer() {
  try {
    const buffer = require('buffer');
    if (buffer && buffer.Buffer && !buffer.SlowBuffer) {
      buffer.SlowBuffer = buffer.Buffer;
    }
  } catch (_error) {
    // ignore - best effort only
  }
}

if (typeof window === 'undefined') {
  removeWebStorage('localStorage');
  removeWebStorage('sessionStorage');
  ensureSlowBuffer();
}

module.exports = {};
