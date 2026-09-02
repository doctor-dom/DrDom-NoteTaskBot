/**
 * Estimate vertical page quarter of a lasso selection for subtask location.
 * Quarters: Top | Upper | Lower | Bottom
 *
 * Prefer a pixel lasso rect when available. Otherwise map EMR element bounds
 * using the same axis rotation as PointUtils (EMR x → Android y on portrait pages).
 */

import {log} from './debug';

const TAG = 'LassoLoc';

export const LASSO_LOCATIONS = Object.freeze(['Top', 'Upper', 'Lower', 'Bottom']);

/** EMR max ranges keyed like PointUtils / official docs. */
const EMR_MAX_BY_PAGE = {
  '1404x1872': {maxX: 15819, maxY: 11864},
  '1872x1404': {maxX: 11864, maxY: 15819},
  '1920x2560': {maxX: 21632, maxY: 16224},
  '2560x1920': {maxX: 16224, maxY: 21632},
};

function pageKey(pageSize) {
  return `${pageSize.width}x${pageSize.height}`;
}

function getEmrMax(pageSize) {
  const known = EMR_MAX_BY_PAGE[pageKey(pageSize)];
  if (known) return known;

  // Fallback: infer from aspect (portrait → taller page maps to larger EMR X).
  const isPortrait = pageSize.width <= pageSize.height;
  if (pageSize.width >= 1800 || pageSize.height >= 2400) {
    return isPortrait
      ? {maxX: 21632, maxY: 16224}
      : {maxX: 16224, maxY: 21632};
  }
  return isPortrait
    ? {maxX: 15819, maxY: 11864}
    : {maxX: 11864, maxY: 15819};
}

/**
 * Map a ratio in [0, 1] (0 = top of page) to a quarter label.
 */
export function quarterFromRatio(ratio) {
  const r = Math.min(1, Math.max(0, ratio));
  if (r < 0.25) return 'Top';
  if (r < 0.5) return 'Upper';
  if (r < 0.75) return 'Lower';
  return 'Bottom';
}

/**
 * Pixel-rect path: use vertical center of {top,bottom} relative to page height.
 */
export function locationFromPixelRect(rect, pageSize) {
  if (!rect || !pageSize?.height) return null;
  const top = Number(rect.top);
  const bottom = Number(rect.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;

  const centerY = (top + bottom) / 2;
  const ratio = centerY / Math.max(1, pageSize.height - 1);
  const location = quarterFromRatio(ratio);
  log(
    TAG,
    `pixel rect top=${top} bottom=${bottom} centerY=${centerY.toFixed(1)} ` +
      `pageH=${pageSize.height} → ${location}`,
  );
  return location;
}

/**
 * Convert EMR point to Android pixel Y (vertical on page), matching PointUtils.emrPoint2Android.
 */
function emrToAndroidY(emrX, emrY, pageSize) {
  const {maxX, maxY} = getEmrMax(pageSize);
  const mappingTimesX = maxX / Math.max(1, pageSize.height - 1);
  // Android y = EMR x / mappingTimesX  (see PointUtils)
  return emrX / mappingTimesX;
}

function collectEmrSamples(elements) {
  const samples = [];
  if (!Array.isArray(elements)) return samples;

  for (const el of elements) {
    if (el == null) continue;

    const minX = el.minX !== undefined ? Number(el.minX) : null;
    const maxX = el.maxX !== undefined ? Number(el.maxX) : null;
    const minY = el.minY !== undefined ? Number(el.minY) : null;
    const maxY = el.maxY !== undefined ? Number(el.maxY) : null;

    if (Number.isFinite(maxX)) {
      const x = Number.isFinite(minX) ? (minX + maxX) / 2 : maxX;
      const y = Number.isFinite(maxY)
        ? Number.isFinite(minY)
          ? (minY + maxY) / 2
          : maxY
        : 0;
      samples.push({x, y, source: 'bounds'});
    }

    const stroke = el.stroke;
    const points = stroke?.points;
    if (Array.isArray(points) && points.length > 0) {
      const mid = points[Math.floor(points.length / 2)];
      if (mid && Number.isFinite(mid.x)) {
        samples.push({x: mid.x, y: Number(mid.y) || 0, source: 'points'});
      }
    }
  }
  return samples;
}

/**
 * Estimate location from lasso elements (EMR) + page pixel size.
 * @returns {'Top'|'Upper'|'Lower'|'Bottom'}
 */
export function estimateLassoLocation(elements, pageSize, pixelRect = null) {
  const size = pageSize || {width: 1404, height: 1872};

  const fromRect = locationFromPixelRect(pixelRect, size);
  if (fromRect) return fromRect;

  const samples = collectEmrSamples(elements);
  if (samples.length === 0) {
    log(TAG, 'No element bounds; defaulting to Top');
    return 'Top';
  }

  let sumY = 0;
  for (const s of samples) {
    sumY += emrToAndroidY(s.x, s.y, size);
  }
  const centerY = sumY / samples.length;
  const ratio = centerY / Math.max(1, size.height - 1);
  const location = quarterFromRatio(ratio);

  log(
    TAG,
    `EMR samples=${samples.length} centerY=${centerY.toFixed(1)} ` +
      `page=${size.width}x${size.height} ratio=${ratio.toFixed(3)} → ${location}`,
  );
  return location;
}
