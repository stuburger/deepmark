/**
 * Resolution-independent sizing constants for annotation overlays.
 *
 * All sizes are expressed as ratios of a single `unit` value derived from the
 * image's natural height: `unit = scaleY × 20`. This cancels out the
 * viewBox→screen mapping, producing consistent on-screen sizes (~17px for
 * symbols) regardless of scan resolution.
 *
 * To convert a ratio to viewBox coordinates: `ratio × unit`.
 */

// ─── Base unit ───────────────────────────────────────────────────────────────

/** Compute the base sizing unit from the viewBox scale factor. */
export function overlayUnit(scaleY: number): number {
	return scaleY * 20
}

// ─── Mark overlay ratios ─────────────────────────────────────────────────────

/** Symbol font size (tick, cross) — 1× unit → ~17px on screen. */
export const MARK_SYMBOL_SIZE = 1

/** Underline stroke width — single line. */
export const UNDERLINE_STROKE = 0.1

/** Double-underline stroke width — thinner than single to stay distinct. */
export const DOUBLE_UNDERLINE_STROKE = 0.07

/** Vertical gap between the two lines of a double underline. */
export const DOUBLE_UNDERLINE_GAP = 0.22

/** Stroke width for box and circle outlines. */
export const SHAPE_STROKE = 0.08

/** Padding around box/circle outlines. */
export const SHAPE_PAD = 0.08

/** Extra horizontal padding on circle outlines. */
export const CIRCLE_PAD_X = 0.1

/** Font size for labels rendered beside marks. */
export const LABEL_SIZE = 0.55

/** Horizontal offset from bbox edge to symbol or label. */
export const OFFSET_H = 0.1

/** Symbol left offset (ticks/crosses placed left of the bbox). */
export const SYMBOL_OFFSET_LEFT = 0.25

/** Vertical baseline offset for symbol text. */
export const SYMBOL_BASELINE = 0.35

// ─── Tag overlay ratios ──────────────────────────────────────────────────────

/** Tag pill font size. */
export const TAG_FONT_SIZE = 0.55

/** Tag pill vertical padding (ratio of font size). */
export const TAG_PADDING_V = 0.35

/** Tag pill horizontal padding (ratio of font size). */
export const TAG_PADDING_H = 0.5

/** Tag pill character width estimate (ratio of font size). */
export const TAG_CHAR_WIDTH = 0.6

/** Tag pill border width. */
export const TAG_BORDER = 0.015

/** Tag pill corner radius. */
export const TAG_RADIUS = 0.06

// ─── Hover highlight ratios ─────────────────────────────────────────────────

/** Stroke width for the tag-hover highlight rect. */
export const HOVER_HIGHLIGHT_STROKE = 0.04

/** Dash length for the tag-hover highlight. */
export const HOVER_HIGHLIGHT_DASH = 0.15

/** Gap length for the tag-hover highlight. */
export const HOVER_HIGHLIGHT_GAP = 0.1

/** Corner radius for the tag-hover highlight. */
export const HOVER_HIGHLIGHT_RADIUS = 0.06
