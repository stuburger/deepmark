import type {
	AoAwardEntry,
	GradingResult,
	MarkPointResultEntry,
} from "@/lib/grading/grade-questions"
import type { MarkingMethod } from "@mcp-gcse/db"
import {
	type QuestionStimulusContext,
	renderStimuliBlock,
} from "@mcp-gcse/shared"

// ─── Types ───────────────────────────────────────────────────────────────────

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
	/** Stimuli the question references. Rendered before the question so the
	 * annotator can anchor mark-point spans against the case study context. */
	stimuli?: QuestionStimulusContext[]
	maxScore: number
	/**
	 * Pre-rendered "[t1]word [t2]word …" string built from the CLEAN answer
	 * text + the existing OCR↔answer alignment. Crossed-out drafts are
	 * excluded at the labelling step so the LLM literally cannot pick them.
	 * Replaces the noisy OCR token array that previously fed this prompt.
	 */
	labeledWords: string
	/** Count of anchorable words — used by the anchoring instructions block. */
	labeledWordCount: number
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

/**
 * For LoR-marked questions, this is the canonical annotation source. Each
 * descriptor evaluation carries either a verbatim quote (met) or a gap
 * description (not met) — these become the explicit anchor points the
 * annotator places marks on. Previous behaviour was "read the WWW/EBI
 * summary and guess where to anchor"; this section turns annotation into
 * a deterministic mapping from evaluations → annotations.
 */
function aoAwardsSection(awards: AoAwardEntry[] | undefined): string {
	if (!awards || awards.length === 0) return ""
	const blocks = awards.map((a, idx) => {
		const header = `### Award ${idx + 1} — ${a.ao_code} (Level ${a.level_awarded}, ${a.awarded_marks}/${a.max_marks} marks)`
		const evals = a.descriptor_evaluations
			.map((e, j) => {
				const tag = e.met ? "MET ✓" : "NOT MET ✗"
				return `  ${idx + 1}.${j + 1} ${tag} — "${e.descriptor}"\n      ${e.met ? "Evidence" : "Gap"}: ${e.evidence}`
			})
			.join("\n")
		const whyNot = a.why_not_next_level
			? `\nWhy not next Level: ${a.why_not_next_level}`
			: ""
		return `${header}\n${evals}${whyNot}`
	})
	return `<AoAwards>\nDescriptor evaluations the marker recorded for this response. These are the CANONICAL anchor points for annotation — every met evaluation should produce a positive annotation anchored on its evidence quote, and every not-met evaluation should produce a negative annotation explaining the gap.\n\n${blocks.join("\n\n")}\n</AoAwards>`
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

function labeledAnswerSection(labeledWords: string): string {
	if (labeledWords.length === 0) {
		return "<StudentAnswerLabeled>\n(no labelled words available — annotations cannot be anchored)\n</StudentAnswerLabeled>"
	}
	return `<StudentAnswerLabeled>
The CLEAN student answer, with each word prefixed by a token alias (t1, t2, …). To anchor an annotation, pick the alias of the FIRST word in the span as anchor_start_token and the alias of the LAST word as anchor_end_token. Single-word anchors use the same alias for both.

Crossed-out drafts have been excluded from this list — they cannot and must not be annotated. Only words shown here are anchorable.

${labeledWords}
</StudentAnswerLabeled>`
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
- Skip detailed AO analysis for basic recall
- 1-2 simple tick marks is sufficient`
}

// ─── Static rule sections ────────────────────────────────────────────────────

const ANNOTATION_STRATEGY = `ANNOTATION STRATEGY:
- When <AoAwards> is present (LoR marking): the descriptor evaluations are the CANONICAL anchor source. Produce ONE annotation per evaluation. For each MET evaluation: find the evidence quote in <StudentAnswerLabeled> above (the evidence is a verbatim substring of the clean answer; locate it word-by-word in the labelled list and use the alias of the first matching word as anchor_start_token and the alias of the last as anchor_end_token), and place a positive signal annotation (tick / underline / double_underline) with reason derived from the descriptor. For each NOT MET evaluation: place a negative signal annotation (cross / circle) at the most relevant location — the end of the paragraph where the gap occurs, or the closest related claim — with the gap description in the comment field. Set ao_category to the award's AO code and ao_quality based on met (strong/valid) vs not-met (incorrect/partial).
- When <MarkPointResults> is present (point-based marking): for each AWARDED point find the specific text that earned it (in <StudentAnswerLabeled>) and place a tick or appropriate mark, optionally tagging the AO. For each DENIED point: identify what is missing or weak and annotate with a cross/circle and a brief comment in the comment field explaining what was needed.
- Use your examiner judgement to classify AO skills from the content and context — do not rely on keyword matching.
- The AO labels (e.g. AO1, AO2) and their meanings come from the level descriptors and mark scheme. Use the exact labels and definitions from those descriptors. Do not assume which AOs exist or what they mean.
- If the mark scheme or level descriptors describe what good analysis looks like, use that to assess quality — not a checklist of trigger words.`

const ANNOTATION_TYPES = `ANNOTATION SHAPE:
Each annotation is a SELF-CONTAINED physical mark on the script.
- MUST have: signal (tick/cross/underline/double_underline/box/circle), reason
- OPTIONAL: label, ao_category + ao_quality, comment
- When ao_category is set, also set ao_quality ("strong"/"partial"/"incorrect"/"valid").
- When comment is set, use format: "[diagnosis] → [specific issue]", max 8-14 words.`

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
Each annotation is self-contained — it includes its own signal, reason, optional AO tag, and optional comment. No parent linking.
</Instructions>`

// ─── Density section (dynamic — depends on maxScore) ─────────────────────────

function densitySection(
	maxScore: number,
	aoAwards: AoAwardEntry[] | undefined,
): string {
	// For LoR with descriptor evaluations, annotation density is derived from
	// the evaluation count (one annotation per met/not-met decision). This is
	// deterministic and gives the teacher one anchored mark per discrete
	// decision the marker recorded — much better than the heuristic score-
	// based budget which encouraged the LLM to invent or skip annotations.
	if (aoAwards && aoAwards.length > 0) {
		const evalCount = aoAwards.reduce(
			(sum, a) => sum + a.descriptor_evaluations.length,
			0,
		)
		const commentCap = Math.max(2, Math.ceil(evalCount / 2))
		return `DENSITY:
- Target ~${evalCount} signal annotations — one per descriptor evaluation in <AoAwards> above.
- Maximum ${commentCap} annotations with comment field set (reserve comments for NOT MET descriptors that need a tip).
- Annotations should be in 1:1 correspondence with evaluations: every met evaluation → one positive annotation on its evidence quote; every not-met evaluation → one negative annotation at the relevant location.
- Avoid inventing annotations that don't tie back to a descriptor evaluation.`
	}
	const d = densityTarget(maxScore)
	return `DENSITY:
- Target ${d.min}-${d.max} signal annotations total for this ${maxScore}-mark question
- Maximum ${d.maxComments} annotations with comment field set
- For full marks: fewer annotations is better — just confirm correctness
- Avoid over-marking`
}

function anchoringSection(wordCount: number): string {
	return `ANCHORING:
- anchor_start_token and anchor_end_token are token aliases (e.g. "t14") from <StudentAnswerLabeled> above.
- Pick the alias of the FIRST word in the annotated span as anchor_start_token, and the alias of the LAST word as anchor_end_token.
- For a single-word anchor (e.g. one misspelt word), set anchor_start_token === anchor_end_token.
- Choose the minimal span that captures the annotated phrase (1-5 words typically).
- Each annotation must anchor to a different span — no overlapping ranges.
- anchor_start_token must come at or before anchor_end_token in reading order.
- Both aliases MUST appear in <StudentAnswerLabeled> above (${wordCount} anchorable words available). Crossed-out content is excluded from the labelled list — do not invent aliases for it.`
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
		stimuli,
		maxScore,
		labeledWords,
		labeledWordCount,
		examBoard,
		subject,
		markScheme,
		levelDescriptors,
	} = args

	// Shared grader helper; emits "" when no stimuli so filter() below drops it.
	const stimulusSection = renderStimuliBlock(stimuli).trimEnd()

	// ── Data context ────────────────────────────────────────────────────────
	const contextSections = [
		stimulusSection,
		questionContext(questionText),
		markSchemeSection(markScheme),
		gradingResultSection(r, maxScore),
		markPointResultsSection(r.mark_points_results),
		aoAwardsSection(r.ao_awards),
		wwwEbiSection(r),
		levelDescriptorsSection(levelDescriptors),
		studentAnswerSection(r.student_answer),
		labeledAnswerSection(labeledWords),
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
		densitySection(maxScore, r.ao_awards),
		anchoringSection(labeledWordCount),
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
