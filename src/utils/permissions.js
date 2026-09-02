/**
 * PluginHost permission gate (FILE:READ / FILE:WRITE / INTERNET).
 * Declared in PluginConfig.json uses-permissions; requested at runtime.
 */

import {PluginManager} from 'sn-plugin-lib';
import {log} from './debug';

export const PERM_FILE_READ = 'plugin.permission.FILE:READ';
export const PERM_FILE_WRITE = 'plugin.permission.FILE:WRITE';
export const PERM_INTERNET = 'plugin.permission.INTERNET';

const CAPTURE_PERMISSIONS = [
  {
    name: PERM_FILE_READ,
    desc: 'Read the current note and lasso selection so handwriting can be recognized.',
  },
  {
    name: PERM_FILE_WRITE,
    desc: 'Create or update NoteTaskBot config under MyStyle.',
  },
  {
    name: PERM_INTERNET,
    desc: 'Send captured tasks to Todoist.',
  },
];

function unwrapStatus(res) {
  if (typeof res === 'number' && Number.isFinite(res)) return res;
  if (res == null) return 0;
  if (typeof res.result === 'number') return res.result;
  if (typeof res.result === 'string' && res.result !== '') {
    const n = Number(res.result);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isGranted(status) {
  // hasPermission: 1 granted. requestPermission: 1 this session, 2 always.
  return status === 1 || status === 2;
}

async function callHasPermission(permission) {
  if (typeof PluginManager.hasPermission !== 'function') {
    log('Perm', 'hasPermission not on this host; skipping check');
    return 1;
  }
  return unwrapStatus(await PluginManager.hasPermission(permission));
}

async function callRequestPermission(permission, desc) {
  if (typeof PluginManager.requestPermission !== 'function') {
    log('Perm', 'requestPermission not on this host; skipping request');
    return 1;
  }
  return unwrapStatus(await PluginManager.requestPermission(permission, desc));
}

/**
 * Ensure capture permissions. Throws if the user denies one.
 */
export async function ensureCapturePermissions() {
  for (const {name, desc} of CAPTURE_PERMISSIONS) {
    let status = await callHasPermission(name);
    log('Perm', `${name} hasPermission=${status}`);
    if (isGranted(status)) continue;

    status = await callRequestPermission(name, desc);
    log('Perm', `${name} requestPermission=${status}`);
    if (!isGranted(status)) {
      throw new Error(
        `Permission required: ${name}. Choose Allow (always, if prompted) and tap Retry.`,
      );
    }
  }
}
