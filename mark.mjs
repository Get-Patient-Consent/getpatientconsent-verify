// COPY of app/src/public/js/signature-mark.js from the Get Patient Consent app,
// unchanged below this header. ink-v1 is frozen, so this copy must never be edited:
// a changed renderer is a new id (ink-v2) and a new file. See MARK-FORMAT.md.

/*
 * Signature mark core: the stroke value format and the one renderer.
 *
 * Pure ES module, no DOM. The SAME file is served to the browser at
 * /static/js/signature-mark.js (the capture widget imports it) and imported by
 * the server (validation, the sealed record, PDF and HTML rendering), so what
 * the patient saw while signing is geometrically what the PDF shows.
 * Types: signature-mark.d.ts beside this file. Design: llm/stroke-signature-capture.md
 * sections 4.2 (value) and 4.3 (ink-v1).
 *
 * Value: {"v":1,"w":1000,"h":400,"pointer":"touch","render":"ink-v1","fmt":"xyt",
 *         "strokes":[[x,y,t, x,y,t, ...], ...]}
 * Integer points on a fixed grid (origin top-left), t = ms since the first point,
 * non-decreasing across the whole mark.
 *
 * ink-v1 is FROZEN: it is ported verbatim from llm/prototypes/signature-harness.html
 * (CORE-START..CORE-END, variable width, timing on, base width 8). Changing any
 * constant after ship is a new renderer id (ink-v2), never an edit here.
 */

export const GRID_W = 1000;
export const GRID_H = 400;
/** The signing line sits at this fraction of the pad height (widget and PDF agree). */
export const BASELINE = 0.78;
export const LIMITS = Object.freeze({ maxChars: 200000, maxStrokes: 200, maxPoints: 20000, minPoints: 8, minExtent: 80 });
export const RENDER = 'ink-v1';
export const POINTERS = Object.freeze(['touch', 'pen', 'mouse', 'mixed', 'unknown']);

const BASE_WIDTH = 8;
const isInt = Number.isInteger;
const f = n => (isInt(n) ? String(n) : n.toFixed(1));

/** strokes: flat [x,y,t, x,y,t, ...] integer arrays, as captured. Returns the text value. */
export function encode(strokes, o) {
  return JSON.stringify({
    v: 1, w: GRID_W, h: GRID_H,
    pointer: (o && POINTERS.includes(o.pointer)) ? o.pointer : 'unknown',
    render: RENDER,
    fmt: 'xyt',
    strokes: strokes.filter(s => s.length).map(s => s.slice())
  });
}

/*
 * Returns { mark, errors, warnings, stats }. mark is null when the value is
 * structurally invalid (errors). Warnings (too few points, too small) mean
 * "well-formed but not acceptable as a signature"; the server accepts only a
 * value with neither. Never test for signature-likeness: an X or a shaky line
 * is a valid mark. The returned mark carries only the known keys.
 */
export function decode(text) {
  const errors = [], warnings = [];
  const fail = e => ({ mark: null, errors: [e], warnings, stats: null });
  if (typeof text !== 'string' || !text.length) return fail('No value');
  if (text.length > LIMITS.maxChars) return fail('Value too large');
  let m;
  try { m = JSON.parse(text); } catch (e) { return fail('Not valid JSON'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return fail('Not an object');
  if (m.v !== 1) errors.push('Unsupported version');
  if (m.w !== GRID_W || m.h !== GRID_H) errors.push('Unexpected grid size');
  if (m.fmt !== 'xyt') errors.push('Unknown point format');
  if (m.render !== RENDER) errors.push('Unknown renderer');
  if (!POINTERS.includes(m.pointer)) errors.push('Unknown pointer type');
  if (!Array.isArray(m.strokes)) errors.push('Strokes missing');
  if (errors.length) return { mark: null, errors, warnings, stats: null };
  if (m.strokes.length > LIMITS.maxStrokes) return fail('Too many strokes');

  let count = 0, lastT = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of m.strokes) {
    if (!Array.isArray(s) || !s.length || s.length % 3) return fail('Malformed stroke');
    for (let i = 0; i < s.length; i += 3) {
      const x = s[i], y = s[i + 1], t = s[i + 2];
      if (!isInt(x) || !isInt(y) || x < 0 || x > GRID_W || y < 0 || y > GRID_H) return fail('Point out of bounds');
      if (!isInt(t) || t < lastT) return fail('Timing not in order');
      lastT = t;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (++count > LIMITS.maxPoints) return fail('Too many points');
    }
  }
  if (count < LIMITS.minPoints) warnings.push('Too few points to accept as a signature');
  else if (Math.hypot(maxX - minX, maxY - minY) < LIMITS.minExtent) warnings.push('Mark too small to accept as a signature');
  const mark = { v: 1, w: GRID_W, h: GRID_H, pointer: m.pointer, render: RENDER, fmt: 'xyt', strokes: m.strokes };
  return { mark, errors, warnings, stats: { points: count, strokes: m.strokes.length, durationMs: lastT } };
}

function points(s) {
  const p = [];
  for (let i = 0; i < s.length; i += 3) p.push({ x: s[i], y: s[i + 1], t: s[i + 2] });
  return p;
}

/* Short strokes (one or two points) only: a dot, or a straight line. */
function strokePath(p) {
  if (p.length === 1) return 'M' + p[0].x + ' ' + p[0].y + 'h0.1';
  return 'M' + p[0].x + ' ' + p[0].y + 'L' + p[1].x + ' ' + p[1].y;
}

/*
 * THE one rendering function. Returns [{ d, w }]: SVG path data plus stroke
 * width, in grid units, ascending by width. Canvas (Path2D), inline SVG and
 * pdf-lib drawSvgPath all consume the same output. Stroke only, round caps,
 * colour chosen by the caller.
 */
export function toPaths(mark) {
  /* Widths are quantised to 0.5 grid units and segments of equal width share one path,
     so a whole mark is at most a couple of dozen paths however long it is. */
  const buckets = new Map();
  const put = (w, d) => { const k = Math.round(w * 2) / 2; buckets.set(k, (buckets.get(k) || '') + d); };
  for (const s of mark.strokes) {
    const p = points(s);
    if (p.length < 3) { put(BASE_WIDTH, strokePath(p)); continue; }
    let w = BASE_WIDTH, px = p[0].x, py = p[0].y;
    for (let i = 1; i < p.length; i++) {
      const dt = Math.max(1, p[i].t - p[i - 1].t);
      const v = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) / dt;
      const target = BASE_WIDTH * Math.min(1.5, Math.max(0.45, 1.5 - 0.35 * v));
      w = w * 0.7 + target * 0.3;
      const last = i === p.length - 1;
      const ex = last ? p[i].x : (p[i].x + p[i + 1].x) / 2;
      const ey = last ? p[i].y : (p[i].y + p[i + 1].y) / 2;
      const d = 'M' + f(px) + ' ' + f(py) + (last ? 'L' : 'Q' + p[i].x + ' ' + p[i].y + ' ') + f(ex) + ' ' + f(ey);
      put(w, d);
      px = ex; py = ey;
    }
  }
  return [...buckets.keys()].sort((a, b) => a - b).map(k => ({ d: buckets.get(k), w: k }));
}

/* Standalone SVG markup. Built only from a decoded mark (validated integers), never from client SVG. */
export function toSvg(mark, o) {
  const ink = (o && o.ink) || '#14213d';
  const body = toPaths(mark).map(p => '<path d="' + p.d + '" stroke-width="' + p.w + '"/>').join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + mark.w + ' ' + mark.h + '" fill="none" stroke="' + ink +
    '" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}
