/**
 * Mock UI firmware APIs
 * Simulates ui.render, ui.confirm, and ui.onInput.
 */

'use strict';

let _autoConfirmResponse = true;
let _inputQueue = [];
let _inputListeners = [];
let _renderLog = [];

export const ui = {
  /**
   * Mock ui.render — logs the component to console and render log.
   * @param {object} component
   */
  render(component) {
    _renderLog.push({ ts: Date.now(), component });
    if (component.content) {
      console.log('\n[MOCK ui.render]\n' + component.content + '\n');
    } else {
      console.log('[MOCK ui.render]', JSON.stringify(component));
    }
  },

  /**
   * Mock ui.confirm — returns the preset auto-confirm response.
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async confirm(message) {
    console.log(`[MOCK ui.confirm] ${message} → ${_autoConfirmResponse}`);
    await delay(10);
    return _autoConfirmResponse;
  },

  /**
   * Register a listener for the next user input event.
   * @param {function} callback
   */
  onInput(callback) {
    if (_inputQueue.length > 0) {
      callback(_inputQueue.shift());
    } else {
      _inputListeners.push(callback);
    }
  },

  /** Test helpers */
  _setConfirmResponse(val) { _autoConfirmResponse = val; },
  _pushInput(message) {
    if (_inputListeners.length > 0) {
      _inputListeners.shift()(message);
    } else {
      _inputQueue.push(message);
    }
  },
  _getRenderLog() { return _renderLog; },
  _clearRenderLog() { _renderLog = []; },
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

globalThis.ui = ui;
