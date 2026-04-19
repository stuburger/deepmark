import type {
	GradingResult,
	MarkPointResultEntry,
} from "@/lib/grading/grade-questions"
import type { MarkingMethod } from "@mcp-gcse/db"

// ─── Types ───────────────────────────────────────────────────────────────────

type TokenSummary = {
	text: string
	pageOrder: number
}

type MarkSchemeContext = {
	description: string
	guidance: string | null
	markPoints: Array<{
		pointNumber: number
		description: string
		criteria: string
	}>
	markingMethod: MarkingMethod
	content: string
}

type AnnotationPromptArgs = {
	gradingResult: GradingResult
	questionText: string
	maxScore: number
	tokens: TokenSummary[]
	examBoard: string | null
	subject: string | null
	markScheme: MarkSchemeContext | null
	levelDescriptors: string | null
}

// ─── Density ─────────────────────────────────────────────────────────────────

type DensityTarget = { min: number; max: number; maxComments: number }

function densityTarget(maxScore: number): DensityTarget {
	if (maxScore <= 2) return { min: 1, max: 2, maxComments: 1 }
	if (maxScore <= 4) return { min: 2, max: 3, maxComments: 2 }
	if (maxScore <= 6) return { min: 3, max: 5, maxComments: 3 }
	if (maxScore <= 9) return { min: 5, max: 7, maxComments: 4 }
	return { min: 8, max: 12, maxComments: 6 }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMarkPointResults(results: MarkPointResultEntry[]): string {
	if (results.length === 0) return "No mark point results available."
	return results
		.map(
			(r) =>
				`Point ${r.pointNumber}: ${r.awarded ? "AWARDED ✓" : "NOT AWARDED ✗"}
  Expected: ${r.expectedCriteria ?? "—"}
  Student covered: ${r.studentCovered ?? "—"}
  Reasoning: ${r.reasoning}`,
		)
		.join("\n\n")
}

// ─── Context sections (dynamic — depend on grading result / mark scheme) ────

function systemPreamble(): string {
	return "You are an expert GCSE examiner annotating a student's answer script. Your job is to place precise marks on the script that show the student's thinking has been carefully read and evaluated."
}

function questionContext(questionText: string): string {
	return `<Question>\n${questionText}\n</Question>`
}

function markSchemeSection(markScheme: MarkSchemeContext | null): string {
	if (!markScheme) return ""
	const points =
		markScheme.markPoints.length > 0
			? `\nMark points:\n${markScheme.markPoints.map((mp) => `  Point ${mp.pointNumber}: ${mp.description}\n    Criteria: ${mp.criteria}`).join("\n")}`
			: ""
	const hasContent = !!markScheme.content?.trim()
	const contentBlock = hasContent
		? `\n<MarkSchemeContent>\n${markScheme.content}\n</MarkSchemeContent>`
		: ""
	return `<MarkScheme>
Description: ${markScheme.description}
${markScheme.guidance ? `Guidance: ${markScheme.guidance}` : ""}
Marking method: ${markScheme.markingMethod}${points}
</MarkScheme>${contentBlock}`
}

function gradingResultSection(r: GradingResult, maxScore: number): string {
	return `<GradingResult>
Score: ${r.awarded_score}/${maxScore}
${r.level_awarded !== undefined ? `Level awarded: ${r.level_awarded}` : ""}
Feedback: ${r.feedback_summary}
Examiner reasoning: ${r.llm_reasoning}
</GradingResult>`
}

function markPointResultsSection(results: MarkPointResultEntry[]): string {
	if (results.length === 0) return ""
	return `<MarkPointResults>\n${formatMarkPointResults(results)}\n</MarkPointResults>`
}

function wwwEbiSection(r: GradingResult): string {
	if (!r.what_went_well?.length && !r.even_better_if?.length) return ""
	return `<GradingSummary>
${r.what_went_well?.length ? `What went well: ${r.what_went_well.join("; ")}` : ""}
${r.even_better_if?.length ? `Even better if: ${r.even_better_if.join("; ")}` : ""}
</GradingSummary>`
}

function levelDescriptorsSection(levelDescriptors: string | null): string {
	if (!levelDescriptors) return ""
	return `<ExamLevelDescriptors>\n${levelDescriptors}\n</ExamLevelDescriptors>`
}

function studentAnswerSection(answer: string): string {
	return `<StudentAnswer>\n${answer}\n</StudentAnswer>`
}

function ocrTokensSection(tokens: TokenSummary[]): string {
	const tokenList = tokens.map((t, i) => `[${i}] "${t.text}"`).join(" ")
	return `<OCRTokens>\n${tokenList}\n</OCRTokens>`
}

function subjectContext(
	examBoard: string | null,
	subject: string | null,
): string {
	return `<ExamBoard>${examBoard ?? "AQA"}</ExamBoard>

<SubjectContext>
Subject: ${subject ?? "Unknown"}
NOTE: Assessment Objective (AO) definitions are SUBJECT-SPECIFIC. Different subjects have different numbers of AOs with different meanings (e.g. Religious Studies has 2 AOs, English Language has 6). Read the level descriptors and mark scheme to understand what each AO means for THIS subject. Do NOT assume AO1 = knowledge — that is only true for some subjects.
</SubjectContext>`
}

// ─── Score guidance (dynamic — varies by score band) ─────────────────────────

function scoreGuidance(awarded: number, maxScore: number): string {
	const percent = maxScore > 0 ? Math.round((awarded / maxScore) * 100) : 0
	if (awarded === maxScore) {
		return `SCORE CONTEXT: The student scored FULL MARKS (${awarded}/${maxScore}).
- ALL annotations must be POSITIVE (ticks, valid tags, positive comments only)
- Do NOT add any crosses, circles, negative comments, or criticism
- Confirm what the student did right — tick each correct point
- If there is little to annotate, use fewer annotations rather than inventing problems`
	}
	if (percent >= 70) {
		return `SCORE CONTEXT: The student scored well (${awarded}/${maxScore}, ${percent}%).
- Annotations should be MOSTLY POSITIVE with minimal constructive feedback
- Only mark genuine weaknesses that cost marks — not nitpicks
- The balance should reflect the high score`
	}
	return `SCORE CONTEXT: The student scored ${awarded}/${maxScore} (${percent}%).
- Annotations should reflect the actual strengths AND weaknesses
- Credit what is genuinely present, flag what is missing or weak
- Balance positive and negative proportionally to the score`
}

function questionTypeGuidance(maxScore: number): string {
	if (maxScore > 2) return ""
	return `QUESTION TYPE: This is a short-answer recall question (${maxScore} marks).
- Keep annotations minimal — just tick valid points
- Do not add chain annotations or detailed AO analysis for basic recall
- 1-2 simple tick marks is sufficient`
}

// ─── Static rule sections ────────────────────────────────────────────────────

const ANNOTATION_STRATEGY = `ANNOTATION STRATEGY:
- Use the mark scheme, mark point results, and LoR summary (if present) to decide what to annotate
- For each AWARDED mark point: find the specific text that earned it, place a tick or appropriate mark, and optionally tag the relevant AO skill using the ao_category field
- For each DENIED mark point: identify what is missing or weak, and annotate with a cross/circle and a brief comment in the comment field explaining what was needed
- Use your examiner judgement to classify AO skills from the content and context — do not rely on keyword matching
- The AO labels (e.g. AO1, AO2) and their meanings come from the level descriptors and mark scheme. Use the exact labels and definitions from those descriptors. Do not assume which AOs exist or what they mean.
- Chain annotations should highlight genuine reasoning structures where the student builds an argument, not just words like "because"
- If the mark scheme or level descriptors describe what good analysis looks like, use that to assess quality — not a checklist of trigger words`

const ANNOTATION_TYPES = `ANNOTATION TYPES:
There are two types of annotation. Each annotation is a SELF-CONTAINED record.

1. SIGNAL ANNOTATION: a physical mark ON the script with optional AO tag and comment.
   - MUST have: signal (tick/cross/underline/double_underline/box/circle), reason
   - OPTIONAL: label, ao_category + ao_quality, comment
   - When ao_category is set, also set ao_quality ("strong"/"partial"/"incorrect"/"valid")
   - When comment is set, use format: "[diagnosis] → [specific issue]", max 8-14 words

2. CHAIN: a highlighted connective phrase showing reasoning flow.
   - MUST have: chain_type (reasoning/evaluation/judgement), trigger_phrase
   - Standalone — no signal, no AO data`

const MARK_TYPES = `MARK TYPES:
- tick (✓): correct/valid point → sentiment="positive"
- cross (✗): incorrect/invalid → sentiment="negative" (ONLY when marks were lost)
- underline: applied or contextualised knowledge → sentiment="positive"
- double_underline: developed reasoning or analysis chain → sentiment="positive" or "partial"
- box: precise technical term or key concept → sentiment="positive"
- circle: vague/unclear term → sentiment="negative" (ONLY when marks were lost)`

const REASON_FIELD = `REASON FIELD (REQUIRED on every signal annotation):
Write like an examiner annotating a real script — short, specific, no waffle.
- For ticks: what was credited. e.g. "correct — osmosis", "✓ identifies active transport"
- For crosses: what was wrong or missing. e.g. "needed named example", "confused with mitosis"
- For underlines: what knowledge was applied. e.g. "applied to River Tees case study"
- For double_underlines: what analysis was developed. e.g. "consequence chain — job loss → depopulation"
- For boxes: what term was used. e.g. "precise — 'tectonic hazard'"
- For circles: what was vague. e.g. "which type of energy?"
Max ~10 words. Never generic ("valid point", "good answer"). Always reference the specific content.`

const POINT_BASED_GUIDANCE = `POINT-BASED / DETERMINISTIC QUESTIONS:
- For short-answer questions, use ONE tick (if marks awarded) or ONE cross (if zero marks) per question
- The reason field should summarise which mark points were hit, e.g. "3/4 — osmosis ✓, diffusion ✓, active transport ✓"
- Do NOT place a separate tick for every mark point — keep it clean
- AO tags are optional for short-answer recall questions`

const GLOBAL_RULES = `GLOBAL RULES:
- CRITICAL: Annotation sentiment MUST match the score — do not contradict the grading result
- NEVER invent weaknesses that don't exist
- NEVER invent annotations for content not in the answer
- NEVER write long explanations or repeat the same comment
- ALWAYS anchor to specific text from the student answer
- ALWAYS prefer short + precise over verbose`

const INSTRUCTIONS = `<Instructions>
Analyse the student answer against the mark scheme and mark point results. Place annotations that show this answer has been carefully read and evaluated. Output valid JSON matching the schema.
Return annotations ordered by reading position (ascending token index).
Each annotation is self-contained — signal annotations include their own reason, optional AO tag, and optional comment. No parent linking.
</Instructions>`

// ─── Density section (dynamic — depends on maxScore) ─────────────────────────

function densitySection(maxScore: number): string {
	const d = densityTarget(maxScore)
	return `DENSITY:
- Target ${d.min}-${d.max} signal annotations total for this ${maxScore}-mark question
- Maximum ${d.maxComments} annotations with comment field set
- For full marks: fewer annotations is better — just confirm correctness
- Avoid over-marking`
}

function anchoringSection(tokenCount: number): string {
	return `ANCHORING:
- anchor_start and anchor_end are token indices from the OCR token list above
- anchor_start is the first token index (inclusive), anchor_end is the last (inclusive)
- Choose the minimal span that captures the annotated phrase (1-5 tokens typically)
- Each annotation must anchor to a different token span (no overlapping ranges)
- anchor_start must be <= anchor_end
- Both must be valid indices (0 to ${tokenCount - 1})`
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Builds the Gemini prompt for generating annotations for a single question.
 *
 * Composed from independent section functions — each owns one concern.
 * Static rules are plain constants; dynamic sections are small focused
 * functions. Adding a new rule means adding a section, not finding the
 * right line in a monolithic string.
 */
export function buildAnnotationPrompt(args: AnnotationPromptArgs): string {
	const {
		gradingResult: r,
		questionText,
		maxScore,
		tokens,
		examBoard,
		subject,
		markScheme,
		levelDescriptors,
	} = args

	// ── Data context ────────────────────────────────────────────────────────
	const contextSections = [
		questionContext(questionText),
		markSchemeSection(markScheme),
		gradingResultSection(r, maxScore),
		markPointResultsSection(r.mark_points_results),
		wwwEbiSection(r),
		levelDescriptorsSection(levelDescriptors),
		studentAnswerSection(r.student_answer),
		ocrTokensSection(tokens),
		subjectContext(examBoard, subject),
	]

	// ── Annotation rules ────────────────────────────────────────────────────
	const ruleSections = [
		scoreGuidance(r.awarded_score, maxScore),
		questionTypeGuidance(maxScore),
		ANNOTATION_STRATEGY,
		ANNOTATION_TYPES,
		MARK_TYPES,
		REASON_FIELD,
		POINT_BASED_GUIDANCE,
		densitySection(maxScore),
		anchoringSection(tokens.length),
		GLOBAL_RULES,
	]

	return [
		systemPreamble(),
		"",
		...contextSections.filter(Boolean),
		"",
		"<AnnotationRules>",
		...ruleSections.filter(Boolean),
		"</AnnotationRules>",
		"",
		INSTRUCTIONS,
	].join("\n\n")
}
