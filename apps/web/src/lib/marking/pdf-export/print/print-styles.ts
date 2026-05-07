/**
 * Print stylesheet for the class report. Inlined into a single `<style>`
 * block at the top of the rendered document so the Lambda has zero
 * external assets to fetch (Indie Flower is the one exception — see below).
 *
 * Colour palette mirrors the @react-pdf exporter's `colors` constant
 * (`apps/web/src/lib/marking/pdf-export/styles.ts`). Keeping the values
 * identical makes the visual diff between old and new exporters narrow to
 * "the things HTML actually does better" — flow, page breaks, fonts —
 * rather than "the colours shifted".
 *
 * Note on `@page` footers: we DON'T use `@bottom-*` running content
 * here. Chromium's `displayHeaderFooter: true` + `footerTemplate` (set
 * in `print.ts`) renders per-section labels (cover / legend / student
 * name) which CSS `@page` can't do — running content is per-document,
 * not per-print-call. The Lambda overrides the document's `@page`
 * footers by passing its own template, so any rules here would be
 * ignored anyway.
 */
export const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Indie+Flower&display=swap');

@page {
	size: A4;
	margin: 16mm;
}

* { box-sizing: border-box; }

html, body {
	margin: 0;
	padding: 0;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	color: #111827;
	font-size: 10pt;
	line-height: 1.35;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

h1, h2, h3, p { margin: 0; }

.h1 { font-size: 20pt; font-weight: 700; line-height: 1.15; margin-bottom: 8pt; }
.h2 { font-size: 14pt; font-weight: 700; line-height: 1.2; margin-bottom: 4pt; }
.h3 { font-size: 11pt; font-weight: 700; margin-bottom: 3pt; }
.muted { color: #6B7280; }
.muted-light { color: #9CA3AF; }
.small-muted { font-size: 9pt; color: #6B7280; }
.rule { height: 1px; background: #E5E7EB; margin: 8pt 0; }
.row { display: flex; }
.space-between { display: flex; justify-content: space-between; align-items: flex-start; }
.meta-line { display: flex; flex-wrap: wrap; gap: 12pt; margin-top: 3pt; color: #6B7280; font-size: 9pt; }

.score-good { color: #16A34A; }
.score-warn { color: #CA8A04; }
.score-bad  { color: #DC2626; }

/* ─── Cover ─────────────────────────────────────────────────────────── */
/* No break-after needed: each section (cover, each student) is rendered
 * as its own HTML document and concatenated by the renderer Lambda with
 * sheet-boundary padding between. */
.cover .summary-table { width: 100%; border-collapse: collapse; margin-top: 8pt; }
.cover .summary-table th {
	text-align: left;
	font-size: 9pt;
	font-weight: 700;
	color: #6B7280;
	border-bottom: 1px solid #D1D5DB;
	padding: 0 0 4pt 0;
}
.cover .summary-table td {
	font-size: 10pt;
	border-bottom: 0.5px solid #E5E7EB;
	padding: 5pt 0;
}
.cover .col-marks, .cover .col-percent, .cover .col-grade { text-align: right; }
.cover .col-marks   { width: 70pt; }
.cover .col-percent { width: 50pt; }
.cover .col-grade   { width: 50pt; }

/* ─── Per-student section ───────────────────────────────────────────── */
/* break-before rules removed: each student is its own document. */
.student-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6pt; }
.student-header .right { text-align: right; }

.examiner-summary { margin-top: 10pt; }
.examiner-summary p { font-size: 9pt; color: #6B7280; }

/* ─── MCQ table ─────────────────────────────────────────────────────── */
.question-card {
	border: 1px solid #E5E7EB;
	border-radius: 4pt;
	padding: 10pt;
	margin-bottom: 8pt;
	break-inside: avoid;
	page-break-inside: avoid;
}
.mcq-table { width: 100%; border-collapse: collapse; }
.mcq-table th {
	text-align: left;
	font-size: 9pt;
	font-weight: 700;
	color: #6B7280;
	border-bottom: 1px solid #D1D5DB;
	padding: 0 0 3pt 0;
}
.mcq-table td {
	font-size: 9pt;
	border-bottom: 0.5px solid #E5E7EB;
	padding: 3pt 0;
}
.mcq-table .col-q       { width: 40pt; }
.mcq-table .col-correct { width: 80pt; }
.mcq-table .col-mark    { width: 50pt; text-align: right; }
.mcq-table tfoot td { font-weight: 700; border-bottom: 0; }

/* ─── Written question card ─────────────────────────────────────────── */
.question-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4pt; }
.question-number { font-weight: 700; font-size: 11pt; }
.question-score  { font-weight: 700; font-size: 11pt; }
.question-text   { font-size: 9pt; color: #6B7280; margin-bottom: 6pt; }

.stimulus-box {
	background: #FFFBEB;
	border-left: 2px solid #F59E0B;
	padding: 5pt 8pt;
	margin-bottom: 6pt;
}
.stimulus-label   { font-size: 8pt; font-weight: 700; color: #92400E; margin-bottom: 2pt; }
.stimulus-content { font-size: 8pt; color: #78350F; line-height: 1.3; white-space: pre-wrap; }
.stimulus-image-placeholder { font-size: 8pt; color: #92400E; font-style: italic; }
.stimulus-table { width: 100%; border-collapse: collapse; }
.stimulus-table th, .stimulus-table td {
	font-size: 8pt;
	color: #78350F;
	padding: 3pt 4pt;
	border-right: 0.5px solid #D1D5DB;
}
.stimulus-table th {
	font-weight: 700;
	color: #92400E;
	background: #FEF3C7;
	border-bottom: 1px solid #92400E;
	border-right-color: #92400E;
	text-align: left;
}
.stimulus-table tr td:last-child, .stimulus-table tr th:last-child { border-right: 0; }

.answer-box {
	background: #F9FAFB;
	border: 0.5px solid #E5E7EB;
	border-radius: 3pt;
	padding: 8pt;
}
.answer-text {
	font-family: "Indie Flower", cursive;
	font-size: 12pt;
	line-height: 1.3;
	white-space: pre-wrap;
	margin: 0;
}

.bullet-heading { margin: 6pt 0 2pt 0; font-size: 9pt; font-weight: 700; }
.bullet-heading.www { color: #16A34A; }
.bullet-heading.ebi { color: #CA8A04; }
.bullet-list { margin: 0; padding-left: 12pt; }
.bullet-list li { font-size: 9pt; margin-bottom: 1pt; }

/* ─── Annotation marks ──────────────────────────────────────────────── */
/* AO badge appended after a marked range (e.g. "[AO1]"). */
.ao-label { font-weight: 700; font-size: 8pt; }

/* ─── Legend page ───────────────────────────────────────────────────── */
.legend-block { margin-top: 14pt; }
.legend-row { display: flex; align-items: baseline; margin-bottom: 5pt; gap: 8pt; }
.legend-chain-row { align-items: center; }
.legend-signal { width: 110pt; font-size: 10pt; }
.legend-meaning { font-size: 10pt; }
.legend-swatch { display: inline-block; width: 24pt; height: 10pt; }
.legend-ao-row { display: flex; flex-wrap: wrap; gap: 6pt; }
.legend-ao-badge {
	font-weight: 700;
	font-size: 9pt;
	border: 0.5pt solid;
	padding: 2pt 6pt;
}
`
