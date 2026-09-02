/**
 * Todoist title helpers for NoteTaskBot.
 *
 * Parent = "File Name | Local Relative Path | page N" (one parent per note path + page).
 * Subtask = cleaned lasso OCR with "@ | location |" at the end.
 */

import {toHostPageIndex} from './pageIndex';
import {parseLassoMarkup} from './lassoMarkup';

const STORAGE_PREFIXES = [
  /^\/storage\/emulated\/\d+\//i,
  /^\/sdcard\//i,
  /^\/mnt\/sdcard\//i,
];

export function fileBaseName(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const name = normalized.split('/').filter(Boolean).pop() || 'note';
  const base = name.replace(/\.note$/i, '').trim();
  return base || 'note';
}

/**
 * Folder breadcrumb for the note (no file name), e.g.
 * Note>CHP - Professional>Service Weeks>8-24-26 CON
 */
export function localRelativePath(filePath) {
  let path = String(filePath || '').replace(/\\/g, '/').trim();
  if (!path) return '';

  for (const prefix of STORAGE_PREFIXES) {
    path = path.replace(prefix, '');
  }
  path = path.replace(/^\/+/, '');

  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '';

  // Drop the file name; keep parent folders only.
  return parts.slice(0, -1).join('>');
}

/**
 * Parent title from full SDK path + page:
 *   "RTL | Note>CHP - Professional>Service Weeks>8-24-26 CON | page 3"
 * File-only fallback: "Meeting Notes | page 3"
 */
export function buildParentTitle(filePath, pageNum = 1) {
  const fileName = fileBaseName(filePath);
  const relative = localRelativePath(filePath);
  const page = toHostPageIndex(pageNum);
  const base = relative ? `${fileName} | ${relative}` : fileName;
  return `${base} | page ${page}`;
}

export function normalizeLassoText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Location-only suffix (page lives on the parent title).
 * Example: "@ | upper |"
 */
export function formatPageLocationSuffix(_pageNum, location = 'Top') {
  const loc = String(location || 'Top').toLowerCase();
  return `@ | ${loc} |`;
}

/**
 * One subtask per lasso: "<cleaned ocr> @ | <quarter> |"
 * Also returns dueString / priority stripped from OCR (not left in title).
 *
 * @returns {{
 *   content: string,
 *   dueString: string|null,
 *   priority: number|null,
 *   clientPriority: number|null,
 *   body: string,
 * }}
 */
export function buildSubtaskFromOcr(text, pageNum, location = 'Top') {
  const normalized = normalizeLassoText(text);
  const parsed = parseLassoMarkup(normalized);
  const body = parsed.content || normalized;
  const suffix = formatPageLocationSuffix(pageNum, location);
  const content = body ? `${body} ${suffix}` : suffix;
  return {
    content,
    body,
    dueString: parsed.dueString,
    priority: parsed.priority,
    clientPriority: parsed.clientPriority,
    corrections: parsed.corrections || [],
    markupFromBrackets: !!parsed.markupFromBrackets,
  };
}

/**
 * One subtask per lasso: "<ocr> @ | <quarter> |"
 * Prefer buildSubtaskFromOcr when due/priority parsing is needed.
 */
export function buildSubtaskContent(text, pageNum, location = 'Top') {
  return buildSubtaskFromOcr(text, pageNum, location).content;
}
