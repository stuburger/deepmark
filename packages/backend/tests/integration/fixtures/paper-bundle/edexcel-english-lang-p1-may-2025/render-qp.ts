#!/usr/bin/env bun
/**
 * Renders the synthesized question-paper.pdf for this fixture.
 *
 * Pearson never published the May 2025 1EN0/01 QP as a standalone PDF, so we
 * build a plain typographic facsimile from the question content already
 * extracted into our production DB (exam paper cmowtabin000002kzykccpjlm).
 *
 * The output is intentionally minimum-viable: A4 pages, Helvetica, no answer
 * ruling, no Pearson branding marks. What matters for the eval is the
 * structural signal:
 *   - Cover page with title / paper code / total marks / section breakdown.
 *   - SECTION A header + "answer ALL" description, then Q1–Q4 with
 *     "(N marks)" labels.
 *   - SECTION B header + "Answer ONE question" description, then Q5 + Q6
 *     each (40 marks).
 *
 * That's enough for the bundle prompt to:
 *   1. Pull stimulus content from the separately-provided insert PDF, not
 *      from inside the questions (Q2/Q3 in Neon currently leak extract prose;
 *      we strip that here so the fixture matches the prompt's stated rule).
 *   2. Detect "Answer ONE question" and emit Section B with
 *      choice = { kind: "any_n_of", n: 1 }.
 *   3. Reconcile printed totals: 24 (A) + 40 (B via choice) = 64.
 *
 * Run: bun run packages/backend/tests/integration/fixtures/paper-bundle/edexcel-english-lang-p1-may-2025/render-qp.ts
 * Output: ./question-paper.pdf (next to this file)
 */

import * as fs from "node:fs"
import * as path from "node:path"
import {
	PDFDocument,
	type PDFFont,
	type PDFPage,
	StandardFonts,
	rgb,
} from "pdf-lib"

// ── Paper content (cleaned from production extraction) ───────────────────────
// Q2/Q3 in Neon had extract prose prepended ("Read this extract. …") because
// the legacy extractor inlined stimulus content into question_text. The
// cleaned stems below are what Pearson actually prints — the prose lives in
// the Reading Text Insert (which the bundle ingests separately).

const PAPER = {
	board: "Pearson Edexcel",
	level: "Level 1/Level 2 GCSE (9–1)",
	date: "Friday 23 May 2025",
	timing: "Morning (Time: 1 hour 45 minutes)",
	paperRef: "1EN0/01",
	titleLine1: "English Language",
	titleLine2: "PAPER 1: Fiction and Imaginative Writing",
	youMustHave: "Reading Text Insert (enclosed)",
	totalMarks: 64,
	instructions: [
		"Answer all questions in Section A and ONE in Section B.",
		"You should spend about 1 hour on Section A.",
		"You should spend about 45 minutes on Section B.",
		"Answer the questions in the spaces provided.",
	],
} as const

type Question = {
	number: string
	text: string
	marks: number
	prefix?: string
}

type Section = {
	title: string
	description: string
	/** Marks visible after "TOTAL FOR SECTION X = … MARKS". For any_n_of
	 *  sections this is the value after the choice (one alternative), not the
	 *  sum of all alternatives. */
	printedTotal: number
	questions: Question[]
}

const SECTIONS: Section[] = [
	{
		title: "SECTION A",
		description:
			"Reading. Read the text in the Reading Text Insert provided and answer ALL questions.",
		printedTotal: 24,
		questions: [
			{
				number: "1",
				text: "From lines 1–4, identify a word or phrase which shows that Bobby is going somewhere that is dangerous.",
				marks: 1,
			},
			{
				number: "2",
				text: "From the extract, give two ways in which the narrator shows how much she loves Bobby. You may use your own words or quotations from the text.",
				marks: 2,
			},
			{
				number: "3",
				text: "Re-read lines 8–24. How does the writer use language and structure to show what the narrator experiences on the night that Bobby returns home? Support your views with reference to the text.",
				marks: 6,
			},
			{
				number: "4",
				text: "In this extract, there is an attempt to show the narrator's changing emotions. Evaluate how successfully this is achieved. Support your views with detailed reference to the text.",
				marks: 15,
			},
		],
	},
	{
		title: "SECTION B",
		description: "Imaginative Writing. Answer ONE question.",
		printedTotal: 40,
		questions: [
			{
				number: "*5",
				text: "Write about a time when you had to be away from someone who was important to you. Your response could be real or imagined.",
				marks: 40,
				prefix: "EITHER",
			},
			{
				number: "*6",
				text: "Look at the images provided. Write about a time when you, or someone you know, went on an interesting journey. Your response could be real or imagined. You may wish to base your response on one of the images.",
				marks: 40,
				prefix: "OR",
			},
		],
	},
]

const SPAG_FOOTNOTE =
	"*Your response will be marked for the accurate and appropriate use of vocabulary, spelling, punctuation and grammar."

// ── Layout primitives ────────────────────────────────────────────────────────

const PAGE_W = 595.28 // A4 width in pt
const PAGE_H = 841.89 // A4 height in pt
const MARGIN_X = 56
const MARGIN_TOP = 60
const MARGIN_BOTTOM = 60
const TEXT_WIDTH = PAGE_W - MARGIN_X * 2
const BODY_LEADING = 14

type Ctx = {
	doc: PDFDocument
	page: PDFPage
	font: PDFFont
	bold: PDFFont
	y: number
}

function newPage(ctx: Ctx): Ctx {
	const page = ctx.doc.addPage([PAGE_W, PAGE_H])
	return { ...ctx, page, y: PAGE_H - MARGIN_TOP }
}

function ensureSpace(ctx: Ctx, needed: number): Ctx {
	if (ctx.y - needed < MARGIN_BOTTOM) return newPage(ctx)
	return ctx
}

function wrap(
	text: string,
	font: PDFFont,
	size: number,
	maxWidth: number,
): string[] {
	const lines: string[] = []
	for (const paragraph of text.split("\n")) {
		const words = paragraph.split(/\s+/).filter(Boolean)
		let current = ""
		for (const w of words) {
			const next = current ? `${current} ${w}` : w
			if (font.widthOfTextAtSize(next, size) > maxWidth) {
				if (current) lines.push(current)
				current = w
			} else {
				current = next
			}
		}
		lines.push(current)
	}
	return lines
}

function drawText(
	ctx: Ctx,
	text: string,
	opts: {
		font?: PDFFont
		size?: number
		x?: number
		leading?: number
		color?: ReturnType<typeof rgb>
	} = {},
): Ctx {
	const font = opts.font ?? ctx.font
	const size = opts.size ?? 11
	const x = opts.x ?? MARGIN_X
	const leading = opts.leading ?? BODY_LEADING
	const color = opts.color ?? rgb(0, 0, 0)
	const lines = wrap(text, font, size, TEXT_WIDTH - (x - MARGIN_X))
	let cursor = ctx
	for (const line of lines) {
		cursor = ensureSpace(cursor, leading)
		cursor.page.drawText(line, { x, y: cursor.y, size, font, color })
		cursor = { ...cursor, y: cursor.y - leading }
	}
	return cursor
}

function spacer(ctx: Ctx, dy: number): Ctx {
	return ensureSpace({ ...ctx, y: ctx.y - dy }, 0)
}

// ── Page builders ────────────────────────────────────────────────────────────

function drawCover(ctx: Ctx): Ctx {
	let c = drawText(ctx, PAPER.board, { font: ctx.bold, size: 14 })
	c = drawText(c, PAPER.level, { font: ctx.bold, size: 12 })
	c = spacer(c, 12)
	c = drawText(c, PAPER.date, { font: c.bold, size: 13 })
	c = drawText(c, PAPER.timing, { size: 11 })
	c = drawText(c, `Paper reference ${PAPER.paperRef}`, {
		font: c.bold,
		size: 12,
	})
	c = spacer(c, 16)
	c = drawText(c, PAPER.titleLine1, { font: c.bold, size: 18, leading: 22 })
	c = drawText(c, PAPER.titleLine2, { font: c.bold, size: 14 })
	c = spacer(c, 14)
	c = drawText(c, `You must have: ${PAPER.youMustHave}`, {
		font: c.bold,
		size: 11,
	})
	c = drawText(c, `Total marks: ${PAPER.totalMarks}`, {
		font: c.bold,
		size: 11,
	})
	c = spacer(c, 16)
	c = drawText(c, "Instructions", { font: c.bold, size: 12 })
	c = spacer(c, 4)
	for (const line of PAPER.instructions) {
		c = drawText(c, `• ${line}`, { size: 11 })
	}
	c = spacer(c, 20)
	c = drawText(
		c,
		"Questions labelled with an asterisk (*) are ones where the quality of your written communication will be assessed.",
		{ size: 10, color: rgb(0.25, 0.25, 0.25) },
	)
	return c
}

function drawSection(ctx: Ctx, section: Section): Ctx {
	let c = newPage(ctx)
	c = drawText(c, section.title, { font: c.bold, size: 16, leading: 20 })
	c = spacer(c, 4)
	c = drawText(c, section.description, { size: 11 })
	c = spacer(c, 14)
	for (const q of section.questions) {
		c = drawQuestion(c, q)
		c = spacer(c, 10)
	}
	c = spacer(c, 16)
	// Pearson always prints a "TOTAL FOR SECTION X = N MARKS" line. For
	// any_n_of sections N reflects the choice (one alternative's marks), not
	// the sum of alternatives.
	c = drawText(
		c,
		`TOTAL FOR ${section.title} = ${section.printedTotal} MARKS`,
		{
			font: c.bold,
			size: 11,
		},
	)
	if (section.title === "SECTION B") {
		c = spacer(c, 12)
		c = drawText(c, SPAG_FOOTNOTE, {
			size: 9,
			color: rgb(0.3, 0.3, 0.3),
		})
	}
	return c
}

function drawQuestion(ctx: Ctx, q: Question): Ctx {
	let c = ensureSpace(ctx, BODY_LEADING * 3)
	if (q.prefix) {
		c = drawText(c, q.prefix, { font: c.bold, size: 12 })
		c = spacer(c, 2)
	}
	const header = `${q.number}    `
	const headerWidth = c.bold.widthOfTextAtSize(header, 11)
	c.page.drawText(header, {
		x: MARGIN_X,
		y: c.y,
		size: 11,
		font: c.bold,
	})
	c = drawText(c, q.text, {
		x: MARGIN_X + headerWidth,
		size: 11,
	})
	c = drawText(c, `(${q.marks} mark${q.marks === 1 ? "" : "s"})`, {
		x: MARGIN_X + headerWidth,
		size: 11,
		font: c.bold,
	})
	return c
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const doc = await PDFDocument.create()
	const font = await doc.embedFont(StandardFonts.Helvetica)
	const bold = await doc.embedFont(StandardFonts.HelveticaBold)
	const firstPage = doc.addPage([PAGE_W, PAGE_H])
	let ctx: Ctx = {
		doc,
		page: firstPage,
		font,
		bold,
		y: PAGE_H - MARGIN_TOP,
	}

	ctx = drawCover(ctx)
	for (const section of SECTIONS) {
		ctx = drawSection(ctx, section)
	}

	const out = path.join(__dirname, "question-paper.pdf")
	const bytes = await doc.save()
	fs.writeFileSync(out, bytes)
	console.log(
		`wrote ${out} (${bytes.byteLength} bytes, ${ctx.doc.getPageCount()} pages)`,
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
