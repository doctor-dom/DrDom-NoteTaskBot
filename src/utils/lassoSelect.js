/**
 * Pure helpers for choosing which lasso snapshot to OCR.
 * Kept free of sn-plugin-lib so unit tests can import them.
 */

export function lassoFingerprint(elements) {
  if (!Array.isArray(elements) || elements.length === 0) return '';
  return elements
    .map(el => el.numInPage ?? '?')
    .sort((a, b) => String(a).localeCompare(String(b), undefined, {numeric: true}))
    .join(',');
}

/**
 * Decide which lasso snapshot to use for this capture.
 *
 * @returns {'cache'|'fresh'|'already-captured'|'empty'}
 */
export function pickLassoSource({
  lastFp = '',
  cachedOk = false,
  cachedFp = '',
  cachedIsThisPress = false,
  freshOk = false,
  freshFp = '',
} = {}) {
  const cachedIsNew = !!(cachedOk && cachedFp && cachedFp !== lastFp);
  const freshIsNew = !!(freshOk && freshFp && freshFp !== lastFp);

  if (cachedIsThisPress && cachedIsNew) return 'cache';
  if (freshIsNew) return 'fresh';
  if (cachedIsNew) return 'cache';
  if ((cachedOk && cachedFp && cachedFp === lastFp) || (freshOk && freshFp && freshFp === lastFp)) {
    return 'already-captured';
  }
  return 'empty';
}
