/**
 * Cache lasso elements (and rect) at button-press time before the plugin UI opens.
 * getLassoElements() can return a stale selection if called after slow work.
 *
 * Also bumps a capture generation so App can remount Capture on every button press
 * (the host often keeps the React tree alive after closePluginView).
 */

import {PluginCommAPI} from 'sn-plugin-lib';
import {log} from './debug';
import {lassoFingerprint} from './lassoSelect';

export {lassoFingerprint} from './lassoSelect';

export const LASSO_BUTTON_ID = 200;
export const CONTEXT_BUTTON_ID = 100;

function parseLassoRect(rectRes) {
  const rect = rectRes?.result || rectRes?.rect || (rectRes?.success === false ? null : rectRes);
  if (rect && (rect.left !== undefined || rect.top !== undefined)) return rect;
  return null;
}

function notifyCaptureRequested(generation) {
  global.__noteTaskBotCaptureGen = generation;
  const cb = global.__noteTaskBotOnCaptureRequest;
  if (typeof cb === 'function') {
    cb(generation);
  }
}

export async function cacheLassoOnButtonPress(buttonId) {
  if (buttonId === CONTEXT_BUTTON_ID) {
    const generation = (global.__noteTaskBotLassoGen || 0) + 1;
    global.__noteTaskBotLassoGen = generation;
    notifyCaptureRequested(generation);
    log('Lasso', `Context button press gen=${generation} (no lasso cache)`);
    return;
  }
  if (buttonId !== LASSO_BUTTON_ID) return;

  const generation = (global.__noteTaskBotLassoGen || 0) + 1;
  global.__noteTaskBotLassoGen = generation;
  notifyCaptureRequested(generation);

  const promise = (async () => {
    try {
      const lasso = await PluginCommAPI.getLassoElements();
      let rect = null;
      try {
        const rectRes = await PluginCommAPI.getLassoRect();
        rect = parseLassoRect(rectRes);
        if (rect) {
          log(
            'Lasso',
            `Cached rect: L=${rect.left} T=${rect.top} R=${rect.right} B=${rect.bottom}`,
          );
        }
      } catch (e) {
        log('Lasso', `getLassoRect on button press failed: ${e.message}`);
      }

      const count = lasso?.result?.length ?? 0;
      const fingerprint = count ? lassoFingerprint(lasso.result) : 'none';
      log('Lasso', `Cached on button press gen=${generation}: ${count} elements [${fingerprint}]`);

      const snapshot = {lasso, rect, fingerprint: fingerprint === 'none' ? '' : fingerprint, generation};
      if (global.__noteTaskBotLassoGen === generation) {
        global.__noteTaskBotLassoSnapshot = snapshot;
      }
      return snapshot;
    } catch (e) {
      log('Lasso', `Cache on button press failed: ${e.message}`);
      const snapshot = {lasso: null, rect: null, fingerprint: '', generation, error: e.message};
      if (global.__noteTaskBotLassoGen === generation) {
        global.__noteTaskBotLassoSnapshot = snapshot;
      }
      return snapshot;
    }
  })();

  global.__noteTaskBotLassoCachePromise = promise;
  return promise;
}

export async function waitForButtonPressLasso(timeoutMs = 8000) {
  const expectedGen = global.__noteTaskBotLassoGen || 0;
  const promise = global.__noteTaskBotLassoCachePromise;

  if (promise) {
    try {
      const snapshot = await Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('lasso cache timed out')), timeoutMs);
        }),
      ]);
      if (snapshot) return snapshot;
    } catch (e) {
      log('Lasso', `${e.message}; using last snapshot if present`);
    }
  }

  const fallback = global.__noteTaskBotLassoSnapshot;
  if (fallback) return fallback;
  return {lasso: null, rect: null, fingerprint: '', generation: expectedGen};
}

export function clearLassoCache() {
  global.__noteTaskBotLassoSnapshot = null;
  global.__noteTaskBotLassoCachePromise = null;
}

/** True if a newer button press superseded this capture run. */
export function isCaptureCurrent(generation) {
  return (global.__noteTaskBotLassoGen || 0) === generation;
}
