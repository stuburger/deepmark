/**
 * Email-side design tokens — hand-ported hex from
 * `apps/web/src/app/globals.tokens.css` (the generator output for
 * `geoff_ui_claude_design/v2/deepmark_tokens.json`).
 *
 * Inline styles are the only reliable way to render against Outlook + the
 * 30+ other email clients in the wild — CSS variables don't apply, modern
 * selectors get stripped. So we accept the duplication.
 *
 * Keep in sync manually when the brand palette shifts. `bun gen:tokens` does
 * not touch this file; the design-system lint also doesn't walk this package.
 */
export const colors = {
	// Brand teal — accent / CTA only, never large filled chrome.
	teal50: "#dfffff",
	teal100: "#d9fbff",
	teal500: "#01add0",
	teal600: "#007b9c",
	teal700: "#006384",

	// Ink — true greyscale, anchor at #1A1A1A.
	ink50: "#fafafa",
	ink100: "#f4f4f4",
	ink200: "#e7e7e7",
	ink400: "#acacac",
	ink500: "#868686",
	ink600: "#6c6c6c",
	ink700: "#555555",
	ink900: "#2b2b2b",
	ink950: "#1a1a1a",

	// Page + surface — the warm paper colour the rest of the app sits on.
	pageBg: "#e8e6e0",
	surface: "#f5f4f0",
	cardBg: "#ffffff",

	// Status — restrained palette, used as borders + small accents.
	successBg: "#eafff3",
	successText: "#0d6540",
	warningBg: "#fff7e1",
	warningText: "#7d4600",
	errorText: "#c23b3b",
} as const

export const typography = {
	// No web-safe match for Geist; fall back to a system stack so the email
	// looks consistent across clients without webfont loading.
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
	mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as const

export const radii = {
	// Hard cap at 10px per the design spec — anything more reads as bubbly.
	tile: "5px",
	dialog: "10px",
} as const

export const spacing = {
	xs: "4px",
	sm: "8px",
	md: "16px",
	lg: "24px",
	xl: "32px",
	"2xl": "48px",
} as const
