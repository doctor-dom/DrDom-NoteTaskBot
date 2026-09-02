/**
 * Parse due-date phrases and priority markers out of lasso OCR text.
 *
 * Preferred workflow: put due/priority in [brackets], e.g. "Call dentist [tomorrow !!1]".
 * Inside brackets a looser OCR typo map applies (incl. I1/l1 → !!1).
 * Outside brackets parsing is conservative (no I1/l1).
 *
 * Priority (client !!1 = highest → API 4; !!4 = lowest → API 1).
 * Due phrases are returned as due_string for Todoist. Matched tokens are stripped.
 */

const WEEKDAYS =
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';
const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';

/** Due OCR aliases → canonical Todoist due_string tokens (whole token). */
const DUE_ALIASES = {
  tommorrow: 'tomorrow',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  todya: 'today',
  todat: 'today',
  tonite: 'tonight',
};

/** Client priority digit (1=highest) → Todoist API priority (4=urgent). */
export function clientPriorityToApi(clientDigit) {
  const n = Number(clientDigit);
  if (!Number.isFinite(n) || n < 1 || n > 4) return null;
  return 5 - Math.floor(n);
}

function collapseSpaces(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip one regex match (first hit) from text; return {text, match}.
 */
function stripFirst(text, regex) {
  const m = text.match(regex);
  if (!m) return {text, match: null};
  const next = collapseSpaces(text.replace(m[0], ' '));
  return {text: next, match: m};
}

/**
 * Extract closed [brackets] spans. Unclosed `[` is left in the title.
 * @returns {{body: string, zone: string, hadBrackets: boolean}}
 */
export function extractBracketZones(text) {
  const inners = [];
  const body = String(text || '').replace(/\[([^\]]*)\]/g, (_full, inner) => {
    const trimmed = collapseSpaces(inner);
    if (trimmed) inners.push(trimmed);
    return ' ';
  });
  return {
    body: collapseSpaces(body),
    zone: collapseSpaces(inners.join(' ')),
    hadBrackets: inners.length > 0,
  };
}

/**
 * Apply whole-token due aliases; record corrections.
 */
function applyDueAliases(text, corrections) {
  return collapseSpaces(
    String(text || '').replace(/\b([A-Za-z]+)\b/g, (token) => {
      const key = token.toLowerCase();
      const canon = DUE_ALIASES[key];
      if (!canon) return token;
      if (canon !== token) {
        corrections.push({from: token, to: canon});
      }
      return canon;
    }),
  );
}

/**
 * Find the longest due-phrase match; strip it once.
 */
function extractDueString(text) {
  const duePatterns = [
    new RegExp(
      `\\b(today|tonight|tomorrow)(?:\\s+at\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?\\b`,
      'i',
    ),
    new RegExp(`\\bnext\\s+(?:week|month|(?:${WEEKDAYS}))\\b`, 'i'),
    new RegExp(`\\bevery\\s+(?:day|week|month|weekday|(?:${WEEKDAYS}))\\b`, 'i'),
    /\bin\s+\d+\s+(?:days?|weeks?)\b/i,
    new RegExp(
      `\\b(?:${MONTHS})\\s+\\d{1,2}(?:(?:st|nd|rd|th))?(?:,?\\s*\\d{4})?(?:\\s+at\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?\\b`,
      'i',
    ),
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  ];

  let best = null;
  for (const re of duePatterns) {
    const m = text.match(re);
    if (!m) continue;
    const phrase = m[0];
    if (!best || phrase.length > best.phrase.length) {
      best = {phrase, index: m.index, length: phrase.length};
    }
  }

  if (!best) return {text, dueString: null};

  const next = collapseSpaces(
    text.slice(0, best.index) + ' ' + text.slice(best.index + best.length),
  );
  return {text: next, dueString: collapseSpaces(best.phrase)};
}

/**
 * Extract priority from text.
 * @param {boolean} loose - when true (inside brackets), also accept I1/l1/i1.
 */
function extractPriority(text, loose, corrections) {
  // !!1 … !!4 (optional space)
  {
    const {text: next, match} = stripFirst(text, /!!\s*([1-4])\b/);
    if (match) {
      return {text: next, clientPriority: Number(match[1])};
    }
  }

  // Single bang !1 … !4
  {
    const {text: next, match} = stripFirst(text, /(?:^|\s)!([1-4])(?=\s|$)/);
    if (match) {
      const digit = Number(match[1]);
      corrections.push({from: `!${digit}`, to: `!!${digit}`});
      return {text: next, clientPriority: digit};
    }
  }

  // Whole-token p1–p4
  {
    const {text: next, match} = stripFirst(text, /(?:^|\s)(p[1-4])(?=\s|$)/i);
    if (match) {
      return {text: next, clientPriority: Number(match[1].slice(1))};
    }
  }

  // Loose OCR: I1 / l1 / i1 (brackets only)
  if (loose) {
    const {text: next, match} = stripFirst(text, /(?:^|\s)([IlIi][1-4])(?=\s|$)/);
    if (match) {
      const raw = match[1];
      const digit = Number(raw.slice(-1));
      if (digit >= 1 && digit <= 4) {
        corrections.push({from: raw, to: `!!${digit}`});
        return {text: next, clientPriority: digit};
      }
    }
  }

  return {text, clientPriority: null};
}

/**
 * Parse due + priority from a markup string (already aliases-applied or not).
 * @param {boolean} loose
 */
function parseZone(text, loose, corrections) {
  let working = collapseSpaces(text);
  if (loose) {
    working = applyDueAliases(working, corrections);
  }

  let clientPriority = null;
  let dueString = null;

  {
    const pri = extractPriority(working, loose, corrections);
    working = pri.text;
    clientPriority = pri.clientPriority;
  }

  {
    const due = extractDueString(working);
    working = due.text;
    dueString = due.dueString;
  }

  return {remainder: working, dueString, clientPriority};
}

/**
 * @param {string} raw
 * @returns {{
 *   content: string,
 *   dueString: string|null,
 *   priority: number|null,
 *   clientPriority: number|null,
 *   corrections: Array<{from: string, to: string}>,
 *   markupFromBrackets: boolean,
 * }}
 */
export function parseLassoMarkup(raw) {
  const corrections = [];
  let text = collapseSpaces(raw);
  const {body, zone, hadBrackets} = extractBracketZones(text);

  let dueString = null;
  let clientPriority = null;
  let markupFromBrackets = false;
  let leftoverZone = '';

  if (hadBrackets && zone) {
    const fromBrackets = parseZone(zone, true, corrections);
    if (fromBrackets.dueString) dueString = fromBrackets.dueString;
    if (fromBrackets.clientPriority != null) {
      clientPriority = fromBrackets.clientPriority;
    }
    leftoverZone = fromBrackets.remainder;
    markupFromBrackets = !!(dueString || clientPriority != null);
  }

  let content = body;

  // Conservative fallback for any field not taken from brackets
  if (dueString == null || clientPriority == null) {
    const outside = parseZone(content, false, corrections);
    if (dueString == null && outside.dueString) {
      dueString = outside.dueString;
    }
    if (clientPriority == null && outside.clientPriority != null) {
      clientPriority = outside.clientPriority;
    }
    content = outside.remainder;
  }

  // Unparsed leftover inside brackets (e.g. unknown tokens) append to title
  if (leftoverZone) {
    content = collapseSpaces(`${content} ${leftoverZone}`);
  }

  // Filter noop / duplicate corrections
  const seen = new Set();
  const uniqueCorrections = [];
  for (const c of corrections) {
    if (!c?.from || !c?.to || c.from === c.to) continue;
    const key = `${c.from}→${c.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCorrections.push(c);
  }

  return {
    content,
    dueString,
    priority: clientPriorityToApi(clientPriority),
    clientPriority,
    corrections: uniqueCorrections,
    markupFromBrackets,
  };
}
