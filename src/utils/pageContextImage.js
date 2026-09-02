/**
 * Generate a PNG of the current note page for Todoist "Add context".
 */

import {PluginFileAPI} from 'sn-plugin-lib';
import RNFS from 'react-native-fs';
import {log} from './debug';
import {toHostPageIndex} from './pageIndex';

const CONTEXT_DIR = '/storage/emulated/0/MyStyle/NoteTaskBot';
const CONTEXT_PNG = `${CONTEXT_DIR}/page-context.png`;

async function ensureContextDir() {
  const exists = await RNFS.exists(CONTEXT_DIR);
  if (!exists) {
    await RNFS.mkdir(CONTEXT_DIR);
  }
}

async function generateOnce(notePath, page, pngPath) {
  log('Context', `generateNotePng note=${notePath} page=${page} out=${pngPath}`);
  const res = await PluginFileAPI.generateNotePng({
    notePath,
    page,
    times: 1,
    pngPath,
    type: 1, // white background
  });
  if (!res?.success || res.result === false) {
    const msg = res?.error?.message || JSON.stringify(res?.error || res);
    const err = new Error(`generateNotePng failed: ${msg}`);
    err.code = res?.error?.code;
    throw err;
  }
  return pngPath;
}

function looksLikePageIndexError(err) {
  const msg = `${err?.message || ''} ${err?.code || ''}`.toLowerCase();
  return (
    msg.includes('page') ||
    msg.includes('index') ||
    msg.includes('invalid') ||
    msg.includes('range') ||
    err?.code === 107
  );
}

/**
 * Render the given note page to a local PNG.
 * Uses 1-based host page indices (same as getPageSize); retries once with page-1
 * if the host rejects the index (some docs still describe 0-based pages).
 *
 * @returns {Promise<string>} Absolute path to the PNG file.
 */
export async function generatePageContextPng(notePath, pageNum) {
  if (!notePath) {
    throw new Error('Cannot generate page image: note path is missing');
  }

  await ensureContextDir();
  const pngPath = CONTEXT_PNG;

  try {
    if (await RNFS.exists(pngPath)) {
      await RNFS.unlink(pngPath);
    }
  } catch (e) {
    log('Context', `Could not clear old PNG: ${e.message}`);
  }

  const hostPage = toHostPageIndex(pageNum);
  try {
    await generateOnce(notePath, hostPage, pngPath);
  } catch (err) {
    if (hostPage > 1 && looksLikePageIndexError(err)) {
      log('Context', `page=${hostPage} failed (${err.message}); retrying page=${hostPage - 1}`);
      await generateOnce(notePath, hostPage - 1, pngPath);
    } else if (hostPage === 1 && looksLikePageIndexError(err)) {
      log('Context', `page=1 failed (${err.message}); retrying page=0`);
      await generateOnce(notePath, 0, pngPath);
    } else {
      throw err;
    }
  }

  const exists = await RNFS.exists(pngPath);
  if (!exists) {
    throw new Error('generateNotePng reported success but PNG file is missing');
  }

  log('Context', `PNG ready at ${pngPath}`);
  return pngPath;
}

export async function deletePageContextPng(pngPath = CONTEXT_PNG) {
  try {
    if (await RNFS.exists(pngPath)) {
      await RNFS.unlink(pngPath);
    }
  } catch (e) {
    log('Context', `delete PNG failed: ${e.message}`);
  }
}

export {CONTEXT_DIR, CONTEXT_PNG};
