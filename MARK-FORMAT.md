# The drawn signature mark

From record **schema 1.5** (October 2026) the patient's drawn signature is part of
the signed record itself: `signature_event.mark` in the canonical JSON. It is
covered by the record's hash and ES256 signature like every other field, so
verifying the record (see [`HOW-TO-VERIFY.md`](HOW-TO-VERIFY.md)) also proves the
mark has not changed. Nothing outside the record is needed to see it.

Records sealed at schema 1.4 and earlier carry no `mark`. They either had a typed
name only, or bound a signature image held outside the record by its hash
(`drawn_signature_sha256`); that image is not part of what this repository can
verify.

## The value

```json
"mark": {
  "v": 1, "w": 1000, "h": 400,
  "pointer": "touch", "render": "ink-v1", "fmt": "xyt",
  "strokes": [[x, y, t, x, y, t, ...], [x, y, t, ...]]
}
```

| Field | Meaning |
|---|---|
| `v` | Format version, `1` |
| `w`, `h` | The grid: always 1000 x 400. Origin top-left, y pointing down. Device pixels never appear |
| `pointer` | `touch`, `pen`, `mouse`, `mixed` or `unknown`. Informational |
| `render` | The drawing method that reproduces the look, `ink-v1` (below). A label, not an instruction |
| `fmt` | `xyt`: each point is three integers |
| `strokes` | One flat array per stroke (pen down to pen up): integer `x`, `y` on the grid, and `t`, milliseconds since the first point of the first stroke, never decreasing across the whole mark |

Everything is an integer or a short string, so it passes through RFC 8785
canonicalisation unchanged. The signing line on the pad sat at 78% of the
height (y = 312); the PDF places that line on its printed rule.

The app accepts a mark only if it has at most 200 strokes, 20,000 points and
200,000 characters, every point is in bounds, `t` never decreases, there are at
least 8 points, and the bounding box diagonal is at least 80 grid units. It never
judges whether a mark looks like a signature: an X is a valid mark.

`t` is used only to draw the line's width. It is not used to identify anyone.

## `ink-v1`

The variable-width renderer, frozen. It turns the strokes into SVG path data,
which the app feeds to the browser canvas, inline SVG and the PDF alike.

- Each stroke is smoothed with midpoint quadratics: between consecutive points
  the curve runs from the previous midpoint to the next midpoint, with the point
  itself as the control point. The last segment is a straight line to the last
  point.
- Width, per segment, with base width 8 grid units: `v = distance / max(1, dt)`
  (grid units per ms); `target = 8 * clamp(1.5 - 0.35 * v, 0.45, 1.5)`;
  `w = 0.7 * w_previous + 0.3 * target`, starting each stroke at 8.
- Widths are rounded to the nearest 0.5, and all segments of equal width are
  joined into one path. Paths are emitted in ascending width order.
- A stroke of one point is a dot (`M x y h0.1`); a stroke of two points is a
  straight line at base width.
- Stroke only, no fill, round caps and joins. Path coordinates have at most one
  decimal place.

Any change to these constants would be a new renderer id (`ink-v2`), never an
edit to `ink-v1`. [`mark.mjs`](mark.mjs) is a verbatim copy of the app's
implementation (`app/src/public/js/signature-mark.js`), which is why it carries
a "do not edit" header.

## Redrawing a mark

```bash
node verify.mjs --canonical consent.canonical.json --integrity consent.integrity.json \
  --mark signature.svg
```

This verifies the record as usual and then writes the mark as a standalone SVG,
drawn from the record's own bytes. A record with no mark says so and writes
nothing.
