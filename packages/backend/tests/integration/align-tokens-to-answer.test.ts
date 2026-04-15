import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import type {
	AlignableToken,
	QuestionTokenGroup,
} from "../../src/lib/scan-extraction/align-tokens-to-answer-core"
import { alignTokensToAnswers } from "../../src/lib/scan-extraction/align-tokens-to-answer"
import { Q02_TOKENS } from "./fixtures/fixture-q02-tokens"
import { describe, expect, it } from "vitest"

/**
 * Model used for this eval. Change this to compare models against the same data.
 */
const MODEL_OVERRIDE = {
	provider: "google" as const,
	model: "gemini-2.5-flash-lite",
	temperature: 0.1,
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
// Real data from submission cmnp6hbso000002jr0qpbq163 (Ariane AliaZ, AQA Business).
// Each token pair is a duplicate from two OCR runs on the same page.

function t(id: string, raw: string, corrected?: string): AlignableToken {
	return { id, text_raw: raw, text_corrected: corrected ?? null }
}

/**
 * Q01.1 — MCQ, answer "C", 2 tokens (both duplicates of "C").
 * Tests: ultra-short answer, duplicate detection.
 */
const FIXTURE_MCQ: QuestionTokenGroup = {
	questionId: "cmnp5ygtx000p02laaoxc0c6v",
	questionNumber: "01.1",
	answerText: "C",
	tokens: [
		t("cmnp6hpxt004p02jxm7rd9su7", "C", "C"),
		t("cmnp70n0103oi02l72wigp999", "C", "C"),
	],
}

/**
 * Q3 — Short list answer "land, labour, enterprise, capital", 14 tokens.
 * Every word + comma duplicated. Tests: comma-separated lists, duplicates.
 */
const FIXTURE_SHORT: QuestionTokenGroup = {
	questionId: "cmnp5yhs0000u02laemckdgrz",
	questionNumber: "3",
	answerText: "land, labour, enterprise, capital",
	tokens: [
		t("cmnp6hpxu00au02jxif3iey0j", "land", "land"),
		t("cmnp70n0203un02l799igsxol", "land", "land"),
		t("cmnp70n0203uo02l7jjw7d46i", ",", ","),
		t("cmnp6hpxu00av02jxmkq6ufgp", ",", ","),
		t("cmnp70n0203up02l7167u37og", "labour", "labour"),
		t("cmnp6hpxu00aw02jxa29h4j66", "labour", "labour"),
		t("cmnp6hpxu00ax02jxxmihmaqz", ",", ","),
		t("cmnp70n0203uq02l70z9cu1bk", ",", ","),
		t("cmnp6hpxu00ay02jxyovf5pe5", "enterprise", "enterprise"),
		t("cmnp70n0203ur02l7fcvvbqps", "enterprise", "enterprise"),
		t("cmnp70n0203us02l7hht9cq2a", ",", ","),
		t("cmnp6hpxu00az02jxh108sbmi", ",", ","),
		t("cmnp70n0203ut02l781voa6kd", "capital", "capital"),
		t("cmnp6hpxu00b002jxhkamub86", "capital", "capital"),
	],
}

/**
 * Q01.4 — Medium written answer about sole trader → Ltd, 90 tokens.
 * Heavy duplicates + nonsensical text_corrected from old reconciliation.
 * Tests: noisy OCR corrections, duplicate detection at scale, ordering.
 */
const FIXTURE_MEDIUM: QuestionTokenGroup = {
	questionId: "cmnp5yheq000s02la0iuqekri",
	questionNumber: "01.4",
	answerText:
		"One advantage of a business changing from a sole trader to a Ltd is that all the work won't have to be done by just one person. Another advantage is that if you take a day off the you will still get paid.",
	tokens: [
		t("cmnp70n0203s602l7et4ba4zg", "One", "One"),
		t("cmnp6hpxu008d02jxz37bhjae", "One", "One"),
		t("cmnp70n0203s702l7p63eslow", "advantage", "advantage"),
		t("cmnp6hpxu008e02jx8b49dte5", "advantage", "advantage"),
		t("cmnp70n0203s802l7xxfpzxng", "of", "of"),
		t("cmnp6hpxu008f02jxxxrf482n", "of", "of"),
		t("cmnp70n0203s902l7sxw5hz0c", "trader", "a"),
		t("cmnp6hpxu008g02jxkdptaxze", "trader", "a"),
		t("cmnp70n0203sa02l7z1wdj4bl", "to", "business"),
		t("cmnp6hpxu008h02jxrlhqmq0c", "to", "business"),
		t("cmnp6hpxu008i02jx2hn52pd4", "have", "changing"),
		t("cmnp70n0203sb02l7hkj3543s", "have", "changing"),
		t("cmnp70n0203sc02l76xq0vuyf", "to", "from"),
		t("cmnp6hpxu008j02jxm7vt1ydz", "to", "from"),
		t("cmnp70n0203sd02l7kookdiu8", "be", "a"),
		t("cmnp6hpxu008k02jx98a1qhh9", "be", "a"),
		t("cmnp70n0203se02l72yw0w1ss", "a", "sole"),
		t("cmnp6hpxu008l02jx65vckkbf", "a", "sole"),
		t("cmnp70n0203sf02l71opnbotd", "business", "trader"),
		t("cmnp6hpxu008m02jxyfyugxis", "business", "trader"),
		t("cmnp70n0203sg02l79kul4y19", "changing", "to"),
		t("cmnp6hpxu008n02jxc9m03115", "changing", "to"),
		t("cmnp6hpxu008o02jxgltcqgsx", "from", "a"),
		t("cmnp70n0203sh02l7gc13089n", "from", "a"),
		t("cmnp70n0203si02l7iebbb6a0", "a", "Ltd"),
		t("cmnp6hpxu008p02jxcgetec2s", "a", "Ltd"),
		t("cmnp6hpxu008q02jxjdzkj8pn", "sole", "is"),
		t("cmnp70n0203sj02l7sq0zpasz", "sole", "is"),
		t("cmnp70n0203sk02l7f69lksdw", ".Ltd", "that"),
		t("cmnp6hpxu008r02jxsv23pcjj", ".Ltd", "that"),
		t("cmnp6hpxu008s02jxq67470fl", "is", "all"),
		t("cmnp70n0203sl02l75pafydcj", "is", "all"),
		t("cmnp6hpxu008t02jx2gvymc91", "that", "the"),
		t("cmnp70n0203sm02l7t5egryh4", "that", "the"),
		t("cmnp70n0203sn02l7adzehe5t", "all", "work"),
		t("cmnp6hpxu008u02jxzp35ln2o", "all", "work"),
		t("cmnp70n0203so02l74c5jn8fp", "the", "won't"),
		t("cmnp6hpxu008v02jxr21uiucc", "the", "won't"),
		t("cmnp70n0203sp02l7k9pcpjm2", "work", "have"),
		t("cmnp6hpxu008w02jx4y7o9p7s", "work", "have"),
		t("cmnp70n0203sq02l7ljbk27tq", "won't", "to"),
		t("cmnp6hpxu008x02jx6gb1m3b2", "won't", "to"),
		t("cmnp6hpxu008y02jxgjxyznv3", ".", "be"),
		t("cmnp70n0203sr02l7bwrkntrc", ".", "be"),
		t("cmnp6hpxu008z02jxp1g4v5nq", "done", "done"),
		t("cmnp70n0203ss02l79c3cs0rj", "done", "done"),
		t("cmnp70n0203st02l7xbsq2yyb", "by", "by"),
		t("cmnp6hpxu009002jxnaardfb1", "by", "by"),
		t("cmnp6hpxu009102jxuvum1jvd", "just", "just"),
		t("cmnp70n0203su02l77875yad4", "just", "just"),
		t("cmnp70n0203sv02l77b35d5lq", "one", "one"),
		t("cmnp6hpxu009202jxxk1ff2dr", "one", "one"),
		t("cmnp6hpxu009302jxl02jfkvm", "person", "person"),
		t("cmnp70n0203sw02l734j7jlcw", "person", "person"),
		t("cmnp70n0203sx02l79wy0q6zv", ".", "."),
		t("cmnp6hpxu009402jxodof2qsn", ".", "."),
		t("cmnp70n0203sy02l74iba09vn", "Another", "Another"),
		t("cmnp6hpxu009502jxuqvh4pqc", "Another", "Another"),
		t("cmnp70n0203sz02l7xap44z1j", "if", "advantage"),
		t("cmnp6hpxu009602jxj4yinqqk", "if", "advantage"),
		t("cmnp6hpxu009702jxnkbie8oo", "you", "is"),
		t("cmnp70n0203t002l79t55yxq6", "you", "is"),
		t("cmnp70n0203t102l71xa6tksr", "takes", "that"),
		t("cmnp6hpxu009802jxptrigr6l", "takes", "that"),
		t("cmnp70n0203t202l7jqb0j01w", "a", "if"),
		t("cmnp6hpxu009902jxggjjw6wy", "a", "if"),
		t("cmnp6hpxu009a02jxu3ptam4r", "day", "you"),
		t("cmnp70n0203t302l7alssg6af", "day", "you"),
		t("cmnp6hpxu009b02jxmdjkebqz", "off", "take"),
		t("cmnp70n0203t402l7jwplj6dm", "off", "take"),
		t("cmnp6hpxu009c02jxug5ocbj8", "the", "a"),
		t("cmnp70n0203t502l7pbfjjao9", "the", "a"),
		t("cmnp6hpxu009d02jxufgzmr0h", "advantage", "day"),
		t("cmnp70n0203t602l74lvljldl", "advantage", "day"),
		t("cmnp70n0203t702l76h0fqqo4", "is", "off"),
		t("cmnp6hpxu009e02jxrxb41uul", "is", "off"),
		t("cmnp70n0203t802l7frxyeqxf", "that", "the"),
		t("cmnp6hpxu009f02jxfjsx34gb", "that", "the"),
		t("cmnp6hpxu009g02jxcj90hxnn", "you", "you"),
		t("cmnp70n0203t902l7aakwf9td", "you", "you"),
		t("cmnp70n0203ta02l7x08bj1p3", "will", "will"),
		t("cmnp6hpxu009h02jxjmvjmipw", "will", "will"),
		t("cmnp6hpxu009i02jxkn38ri83", "still", "still"),
		t("cmnp70n0203tb02l7f30iafk8", "still", "still"),
		t("cmnp6hpxu009j02jxz6tm5lc9", "get", "get"),
		t("cmnp70n0203tc02l78vbzmds6", "get", "get"),
		t("cmnp70n0203td02l7npn1v9ar", "paid", "paid"),
		t("cmnp6hpxu009k02jxddrp995q", "paid", "paid"),
		t("cmnp70n0203te02l7zm9u35m6", ".", "."),
		t("cmnp6hpxu009l02jxksqnhnhj", ".", "."),
	],
}

/**
 * Q6 — Long multi-sentence answer about franchising, 64 tokens.
 * Clean OCR (text_corrected matches text_raw), all duplicated.
 * Tests: longer answer alignment, ordering over many tokens.
 */
const FIXTURE_LONG: QuestionTokenGroup = {
	questionId: "cmnp5yich000x02labewyfylh",
	questionNumber: "6",
	answerText:
		"One benefit is that they earn more profit while somebody takes care of their business one drawback is that if the franchisee messes up their business will have a bad reputation.",
	tokens: [
		t("cmnp70n0303wn02l7mgj91556", "One"),
		t("cmnp6hpy300cu02jxx779qzpb", "One"),
		t("cmnp70n0303wo02l7bzrnolwz", "benefit"),
		t("cmnp6hpy300cv02jxn6gawjk2", "benefit"),
		t("cmnp6hpy300cw02jxy67u1ys0", "is"),
		t("cmnp70n0303wp02l7d7sif8bc", "is"),
		t("cmnp6hpy300cx02jxyvv54rw6", "that"),
		t("cmnp70n0303wq02l7cnbjsswm", "that"),
		t("cmnp6hpy300cy02jxn7ve5b8l", "they"),
		t("cmnp70n0303wr02l7tldep7o8", "they"),
		t("cmnp6hpy300cz02jxqkj2d0yr", "earn"),
		t("cmnp70n0303ws02l7ddv6cvqt", "earn"),
		t("cmnp70n0303wt02l7zanfaj3f", "more"),
		t("cmnp6hpy300d002jxotcadyx9", "more"),
		t("cmnp6hpy300d102jxh55ssljw", "profit"),
		t("cmnp70n0303wu02l7flvuligd", "profit"),
		t("cmnp70n0303wv02l7wr0fqlf0", "while"),
		t("cmnp6hpy300d202jxh8baginm", "while"),
		t("cmnp6hpy300d302jxvc5ld4cd", "somebody"),
		t("cmnp70n0303ww02l7kuuxs43z", "somebody"),
		t("cmnp70n0303wx02l799mde1oe", "takes"),
		t("cmnp6hpy300d402jxphio7ywx", "takes"),
		t("cmnp70n0303wy02l7l6o1z6w6", "care"),
		t("cmnp6hpy300d502jx4v7oi29s", "care"),
		t("cmnp70n0303wz02l7m9svjji8", "of"),
		t("cmnp6hpy300d602jx746ddoft", "of"),
		t("cmnp70n0303x002l7qsg3fb1z", "their"),
		t("cmnp6hpy300d702jxuwy5nc0c", "their"),
		t("cmnp6hpy300d802jx9t78gdxa", "business"),
		t("cmnp70n0303x102l72d6lo72g", "business"),
		t("cmnp70n0303x202l7198iucgg", "one"),
		t("cmnp6hpy300d902jxv3ur7tcg", "one"),
		t("cmnp6hpy300da02jxhoaxyo98", "drawback"),
		t("cmnp70n0303x302l7hm5hfkq4", "drawback"),
		t("cmnp6hpy300db02jx78rm4q9x", "is"),
		t("cmnp70n0303x402l752i6h8ll", "is"),
		t("cmnp6hpy300dc02jx8xbthdl6", "that"),
		t("cmnp70n0303x502l7pdqps1zv", "that"),
		t("cmnp6hpy300dd02jxjj4pyq7v", "if"),
		t("cmnp70n0303x602l7leiut6a0", "if"),
		t("cmnp6hpy300de02jxpwj59hwu", "the"),
		t("cmnp70n0303x702l7u5zc68tk", "the"),
		t("cmnp70n0303x802l7mwflomty", "franchisee"),
		t("cmnp6hpy300df02jxktbu3gdu", "franchisee"),
		t("cmnp70n0303x902l7rnlp2wjh", "messes"),
		t("cmnp6hpy300dg02jxwcejid36", "messes"),
		t("cmnp70n0303xa02l78kskehng", "up"),
		t("cmnp6hpy300dh02jxlydpoj2f", "up"),
		t("cmnp70n0303xb02l7lji733s5", "their"),
		t("cmnp6hpy300di02jx053iqvjc", "their"),
		t("cmnp70n0303xc02l7nkfziyga", "business"),
		t("cmnp6hpy300dj02jxbiyd32hz", "business"),
		t("cmnp70n0303xd02l7qvagi8s7", "will"),
		t("cmnp6hpy300dk02jxun6w7eu4", "will"),
		t("cmnp6hpy300dl02jxsj8p675k", "have"),
		t("cmnp70n0303xe02l7uwesjp2u", "have"),
		t("cmnp6hpy300dm02jxslyxr54n", "a"),
		t("cmnp70n0303xf02l7e0meaasi", "a"),
		t("cmnp6hpy300dn02jxsj3idgoq", "bad"),
		t("cmnp70n0303xg02l7jkn7j7fh", "bad"),
		t("cmnp70n0303xh02l77o0mzcv0", "reputation"),
		t("cmnp6hpy300do02jxuoz9otfh", "reputation"),
		t("cmnp70n0303xi02l7vl4oai82", "."),
		t("cmnp6hpy300dp02jxrhfdcavz", "."),
	],
}

/**
 * Q02 — 12-mark extended writing about franchising vs own business, 641 tokens.
 * Extremely noisy OCR: garbled text ("91s0", "bely", "deerde"), page artifacts
 * ("( 12 marks )", "5 | Page"), and heavy duplication.
 * Tests: very large structured output, attention drift, junk detection at scale.
 */
const FIXTURE_VERY_LONG: QuestionTokenGroup = {
	questionId: "cmnp5yji3001302la8gry9zi1",
	questionNumber: "02",
	answerText:
		"One reason why franchising the business is a good idea is that because the franchisees will run the business in his name and he will receive the profit. This means he won't have to do all the work on his own and can rely on his franchisees. This also benefits him because if the franchisees keep a good reputation the business will gain more customers and raise a larger market and profit. However, the limitations of this decision is that if the franchisees are unsuccessful and give the business a bad reputation it won't succeed. And it would be difficult to start again. Plus it is also hard to put trust into someone to take good care of your business. And he would have to pay for all the costs as he's the franchisor. One reason why recruiting managers and decorators to offer their own decorating business is a good idea is because it would cost less. This means if he came up with a successful business plan the bank would lend him a loan which he can use to invest in his business. This also benefits Jim because he would be in control of the business and decide do most decisions. However, this is also bad & bad idea because he would have to pay a lot for expensive machinery with low running costs. And would also have very few employees which means if the business is unsuccessful he will be unable to pay them and stay in business. Overall, I think if becoming a franchisor is the more profitable decision considering the bank won't give a loan unless the business plan is very good. So becoming a franchisor will help Jim save money and grow more improve the growth of his business.",
	tokens: Q02_TOKENS,
}

// ─── Tests ─────────────────────────────────────────────────────────────────

function createRunner() {
	return createLlmRunner({
		"token-answer-mapping": [MODEL_OVERRIDE],
	})
}

function assertAlignmentQuality(
	updates: Awaited<ReturnType<typeof alignTokensToAnswers>>,
	question: QuestionTokenGroup,
	opts: { minMappedPct: number },
) {
	const qUpdates = updates.filter((u) =>
		question.tokens.some((t) => t.id === u.id),
	)
	expect(qUpdates).toHaveLength(question.tokens.length)

	const mapped = qUpdates.filter((u) => u.charStart != null)
	const mappedPct = mapped.length / qUpdates.length

	console.log(
		`  Q${question.questionNumber}: ${mapped.length}/${qUpdates.length} mapped (${Math.round(mappedPct * 100)}%), answer: "${question.answerText.slice(0, 60)}..."`,
	)

	expect(mappedPct).toBeGreaterThanOrEqual(opts.minMappedPct)

	// Char offsets must be within answer text bounds
	for (const u of mapped) {
		expect(u.charStart).toBeGreaterThanOrEqual(0)
		expect(u.charEnd).toBeGreaterThan(u.charStart!)
		expect(u.charEnd).toBeLessThanOrEqual(question.answerText.length)
	}

	// Junk tokens have consistently null offsets
	const junk = qUpdates.filter((u) => u.charStart == null)
	for (const u of junk) {
		expect(u.charEnd).toBeNull()
	}

	return { mapped, junk, mappedPct }
}

describe("alignTokensToAnswers eval", () => {
	it("MCQ: maps single-letter answer with duplicate tokens", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers([FIXTURE_MCQ], llm)

		const { mapped } = assertAlignmentQuality(updates, FIXTURE_MCQ, {
			minMappedPct: 0.4,
		})

		// At least one "C" should map to the answer
		expect(mapped.length).toBeGreaterThanOrEqual(1)
	})

	it("short list: maps comma-separated answer with duplicates", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers([FIXTURE_SHORT], llm)

		assertAlignmentQuality(updates, FIXTURE_SHORT, {
			minMappedPct: 0.4,
		})
	})

	it("medium written: handles noisy OCR corrections and duplicates", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers([FIXTURE_MEDIUM], llm)

		assertAlignmentQuality(updates, FIXTURE_MEDIUM, {
			minMappedPct: 0.3,
		})
	})

	it("long written: maintains ordering over many tokens", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers([FIXTURE_LONG], llm)

		const { mapped } = assertAlignmentQuality(updates, FIXTURE_LONG, {
			minMappedPct: 0.4,
		})

		// Mapped tokens should have generally non-decreasing charStart
		// (allows some out-of-order from duplicates, but trend should hold)
		const charStarts = mapped
			.map((u) => u.charStart!)
			.filter((s) => s > 0)
		let increasing = 0
		for (let i = 1; i < charStarts.length; i++) {
			if (charStarts[i] >= charStarts[i - 1]) increasing++
		}
		const orderingPct =
			charStarts.length > 1 ? increasing / (charStarts.length - 1) : 1
		console.log(`  Ordering: ${Math.round(orderingPct * 100)}% non-decreasing`)
		expect(orderingPct).toBeGreaterThan(0.6)
	})

	it("very long: 641 tokens with extremely noisy OCR (chunked)", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers([FIXTURE_VERY_LONG], llm)

		// Must return exactly 641 mappings — if the LLM drops entries, this fails
		expect(updates).toHaveLength(641)

		const { mapped, junk } = assertAlignmentQuality(
			updates,
			FIXTURE_VERY_LONG,
			{
				// Lower threshold — lots of page artifacts ("( 12 marks )", "5 | Page")
				// and garbled text that should be junk
				minMappedPct: 0.2,
			},
		)

		// Should detect page artifacts as junk
		console.log(
			`  Junk tokens: ${junk.length}/${updates.length} (${Math.round((junk.length / updates.length) * 100)}%)`,
		)

		// Check ordering on mapped tokens
		const charStarts = mapped
			.map((u) => u.charStart!)
			.filter((s) => s > 0)
		let increasing = 0
		for (let i = 1; i < charStarts.length; i++) {
			if (charStarts[i] >= charStarts[i - 1]) increasing++
		}
		const orderingPct =
			charStarts.length > 1 ? increasing / (charStarts.length - 1) : 1
		console.log(
			`  Ordering: ${Math.round(orderingPct * 100)}% non-decreasing`,
		)
		expect(orderingPct).toBeGreaterThan(0.5)

		const snapshot = llm.toSnapshot()
		const effective = snapshot.effective["token-answer-mapping"]
		console.log(
			`  Tokens used: ${effective?.prompt_tokens} prompt + ${effective?.completion_tokens} completion`,
		)
	})

	it("parallel: processes multiple questions concurrently", async () => {
		const llm = createRunner()
		const updates = await alignTokensToAnswers(
			[FIXTURE_MCQ, FIXTURE_SHORT, FIXTURE_LONG],
			llm,
		)

		const totalTokens =
			FIXTURE_MCQ.tokens.length +
			FIXTURE_SHORT.tokens.length +
			FIXTURE_LONG.tokens.length
		expect(updates).toHaveLength(totalTokens)

		assertAlignmentQuality(updates, FIXTURE_MCQ, { minMappedPct: 0.4 })
		assertAlignmentQuality(updates, FIXTURE_SHORT, { minMappedPct: 0.4 })
		assertAlignmentQuality(updates, FIXTURE_LONG, { minMappedPct: 0.4 })

		// Verify snapshot recorded all 3 calls
		const snapshot = llm.toSnapshot()
		const effective = snapshot.effective["token-answer-mapping"]
		expect(effective?.total_calls).toBe(3)
		console.log("LLM snapshot:", JSON.stringify(snapshot, null, 2))
	})
})
