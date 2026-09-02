/**
 * Config loader — Todoist API token from MyStyle JSON or bundled config.local.js
 */

import RNFS from 'react-native-fs';
import {log} from './debug';

let bundledConfig = {};
try {
  const localConfig = require('../../config.local');
  bundledConfig = localConfig.default || localConfig;
} catch {}

const CONFIG_DIR = '/storage/emulated/0/MyStyle/NoteTaskBot';
const CONFIG_FILE = CONFIG_DIR + '/notetaskbot-config.json';
const SUPERTASK_CONFIG_FILE = '/storage/emulated/0/MyStyle/SuperTask/supertask-config.json';
const PLACEHOLDER_TOKEN = 'YOUR_TOKEN_HERE';
const DEFAULT_TARGET_PROJECT_ID = '6fVCFGxCf6MVJwm8';
const OBF_KEY = 'sntask_v1_8f3a2c9d7e1b';
const OBF_PREFIX = 'xor1:';

let _runtimeConfig = null;
let _configSource = 'none';

function deobfuscateToken(value) {
  if (!value || !value.startsWith(OBF_PREFIX)) return value;
  try {
    const encoded = value.slice(OBF_PREFIX.length);
    const bytes = atob(encoded);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(
        bytes.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length),
      );
    }
    return out;
  } catch {
    return value;
  }
}

function normalizeToken(value) {
  const token = deobfuscateToken(value)?.trim();
  if (!token || token === PLACEHOLDER_TOKEN || token.includes('YOUR_')) return '';
  return token;
}

async function loadSuperTaskToken() {
  try {
    if (!(await RNFS.exists(SUPERTASK_CONFIG_FILE))) return '';
    const raw = await RNFS.readFile(SUPERTASK_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeToken(parsed.apiToken);
  } catch (e) {
    log('Config', `SuperTask fallback failed: ${e.message}`);
    return '';
  }
}

export function getConfigSource() {
  return _configSource;
}

async function ensureTemplate() {
  try {
    if (await RNFS.exists(CONFIG_FILE)) return;
    const dirExists = await RNFS.exists(CONFIG_DIR);
    if (!dirExists) await RNFS.mkdir(CONFIG_DIR);
    const template = {
      apiToken: PLACEHOLDER_TOKEN,
      targetProjectId: DEFAULT_TARGET_PROJECT_ID,
    };
    await RNFS.writeFile(CONFIG_FILE, JSON.stringify(template, null, 2), 'utf8');
    log('Config', `Created template at ${CONFIG_FILE}`);
  } catch (e) {
    log('Config', `Template creation failed: ${e.message}`);
  }
}

export async function loadConfig() {
  if (_runtimeConfig) return _runtimeConfig;

  await ensureTemplate();

  try {
    if (await RNFS.exists(CONFIG_FILE)) {
      const raw = await RNFS.readFile(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const apiToken = normalizeToken(parsed.apiToken);
      if (apiToken) {
        _runtimeConfig = {
          apiToken,
          targetProjectId: parsed.targetProjectId?.trim() || DEFAULT_TARGET_PROJECT_ID,
        };
        _configSource = 'notetaskbot-file';
        log('Config', `Loaded config from MyStyle JSON (project=${_runtimeConfig.targetProjectId})`);
        return _runtimeConfig;
      }
    }
  } catch (e) {
    log('Config', `File load failed: ${e.message}`);
  }

  const superTaskToken = await loadSuperTaskToken();
  if (superTaskToken) {
    _runtimeConfig = {
      apiToken: superTaskToken,
      targetProjectId: DEFAULT_TARGET_PROJECT_ID,
    };
    _configSource = 'supertask-fallback';
    log('Config', 'Loaded token from SuperTask config (fallback)');
    return _runtimeConfig;
  }

  if (bundledConfig.apiToken) {
    _runtimeConfig = {
      apiToken: normalizeToken(bundledConfig.apiToken) || bundledConfig.apiToken,
      targetProjectId: bundledConfig.targetProjectId || DEFAULT_TARGET_PROJECT_ID,
    };
    _configSource = 'bundled';
    log('Config', 'Loaded token from bundled config.local.js');
    return _runtimeConfig;
  }

  _runtimeConfig = {apiToken: '', targetProjectId: DEFAULT_TARGET_PROJECT_ID};
  _configSource = 'none';
  log('Config', 'No API token configured');
  return _runtimeConfig;
}

export function clearConfigCache() {
  _runtimeConfig = null;
  _configSource = 'none';
}
