import type { GradingResult, MarkPointResultEntry } from "@/lib/grade-questions"

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
	markingMethod: string
	markingRules: unknown | null
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

/**
 * Density rules: target annotation count by max marks available.
 */
function densityTarget(maxScore: number): {
	min: number
	max: number
	maxComments: number
} {
	if (maxScore <= 2) return { min: 1, max: 2, maxComments: 1 }
	if (maxScore <= 4) return { min: 2, max: 3, maxComments: 2 }
	if (maxScore <= 6) return { min: 3, max: 5, maxComments: 3 }
	if (maxScore <= 9) return { min: 5, max: 7, maxComments: 4 }
	return { min: 8, max: 12, maxComments: 6 }
}

function formatMarkPointResults(
	results: MarkPointResultEntry[],
): string {
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

/**
 * Builds the Gemini prompt for generating annotations for a single question.
 * Uses mark scheme, mark point results, and level descriptors to drive
 * annotation decisions — no hardcoded keyword checklists.
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
	const density = densityTarget(maxScore)
	const scorePercent =
		maxScore > 0 ? Math.round((r.awarded_score / maxScore) * 100) : 0
	const isFullMarks = r.awarded_score === maxScore
	const isHighScore = scorePercent >= 70
	const isLowMarkQuestion = maxScore <= 2

	// Sequential index format: [0] "Quality" [1] "management" ...
	const tokenList = tokens.map((t, i) => `[${i}] "${t.text}"`).join(" ")

	// WWW/EBI from grading (if available)
	const wwwEbiSection =
		r.what_went_well?.length || r.even_better_if?.length
			? `
<GradingSummary>
${r.what_went_well?.length ? `What went well: ${r.what_went_well.join("; ")}` : ""}
${r.even_better_if?.length ? `Even better if: ${r.even_better_if.join("; ")}` : ""}
</GradingSummary>`
			: ""

	// Mark scheme section
	const markSchemeSection = markScheme
		? `
<MarkScheme>
Description: ${markScheme.description}
${markScheme.guidance ? `Guidance: ${markScheme.guidance}` : ""}
Marking method: ${markScheme.markingMethod}
${markScheme.markPoints.length > 0 ? `\nMark points:\n${markScheme.markPoints.map((mp) => `  Point ${mp.pointNumber}: ${mp.description}\n    Criteria: ${mp.criteria}`).join("\n")}` : ""}
${markScheme.markingRules ? `\nMarking rules: ${JSON.stringify(markScheme.markingRules)}` : ""}
</MarkScheme>`
		: ""

	// Mark point results section
	const markPointResultsSection =
		r.mark_points_results.length > 0
			? `
<MarkPointResults>
${formatMarkPointResults(r.mark_points_results)}
</MarkPointResults>`
			: ""

	// Level descriptors section
	const levelDescriptorsSection = levelDescriptors
		? `
<ExamLevelDescriptors>
${levelDescriptors}
</ExamLevelDescriptors>`
		: ""

	// Score-aware annotation guidance
	let scoreGuidance: string
	if (isFullMarks) {
		scoreGuidance = `SCORE CONTEXT: The student scored FULL MARKS (${r.awarded_score}/${maxScore}).
- ALL annotations must be POSITIVE (ticks, valid tags, positive comments only)
- Do NOT add any crosses, circles, negative comments, or criticism
- Confirm what the student did right — tick each correct point
- If there is little to annotate, use fewer annotations rather than inventing problems`
	} else if (isHighScore) {
		scoreGuidance = `SCORE CONTEXT: The student scored well (${r.awarded_score}/${maxScore}, ${scorePercent}%).
- Annotations should be MOSTLY POSITIVE with minimal constructive feedback
- Only mark genuine weaknesses that cost marks — not nitpicks
- The balance should reflect the high score`
	} else {
		scoreGuidance = `SCORE CONTEXT: The student scored ${r.awarded_score}/${maxScore} (${scorePercent}%).
- Annotations should reflect the actual strengths AND weaknesses
- Credit what is genuinely present, flag what is missing or weak
- Balance positive and negative proportionally to the score`
	}

	// Low-mark question guidance
	const lowMarkGuidance = isLowMarkQuestion
		? `\nQUESTION TYPE: This is a short-answer recall question (${maxScore} marks).
- Keep annotations minimal — just tick valid points
- Do not add chain annotations or detailed AO analysis for basic recall
- 1-2 simple tick marks is sufficient`
		: ""

	return `You are an expert GCSE examiner annotating a student's answer script. Your job is to place precise marks on the script that show the student's thinking has been carefully read and evaluated.

<Question>
${questionText}
</Question>
${markSchemeSection}
<GradingResult>
Score: ${r.awarded_score}/${maxScore}
${r.level_awarded !== undefined ? `Level awarded: ${r.level_awarded}` : ""}
Feedback: ${r.feedback_summary}
Examiner reasoning: ${r.llm_reasoning}
</GradingResult>${markPointResultsSection}${wwwEbiSection}${levelDescriptorsSection}

<StudentAnswer>
${r.student_answer}
</StudentAnswer>

<OCRTokens>
${tokenList}
</OCRTokens>

<ExamBoard>${examBoard ?? "AQA"}</ExamBoard>

<SubjectContext>
Subject: ${subject ?? "Unknown"}
NOTE: Assessment Objective (AO) definitions are SUBJECT-SPECIFIC. Different subjects have different numbers of AOs with different meanings (e.g. Religious Studies has 2 AOs, English Language has 6). Read the level descriptors and mark scheme to understand what each AO means for THIS subject. Do NOT assume AO1 = knowledge — that is only true for some subjects.
</SubjectContext>

<AnnotationRules>
${scoreGuidance}${lowMarkGuidance}

ANNOTATION STRATEGY:
- Use the mark scheme, mark point results, and LoR summary (if present) to decide what to annotate
- For each AWARDED mark point: find the specific text that earned it, place a tick or appropriate mark, and tag the relevant AO skill
- For each DENIED mark point: identify what is missing or weak, and annotate with a cross/circle and a brief comment explaining what was needed
- Use your examiner judgement to classify AO skills from the content and context — do not rely on keyword matching
- The AO labels (e.g. AO1, AO2) and their meanings come from the level descriptors and mark scheme. Use the exact labels and definitions from those descriptors. Do not assume which AOs exist or what they mean.
- Chain annotations should highlight genuine reasoning structures where the student builds an argument, not just words like "because"
- If the mark scheme or level descriptors describe what good analysis looks like, use that to assess quality — not a checklist of trigger words

OVERLAY TYPES:
- "mark": physical signal ON the script (tick, cross, underline, double_underline, box, circle)
- "tag": semantic skill badge attached to a mark (e.g. [✓ AO2]). Must have a parent_index pointing to a mark.
- "comment": short margin note. Format: "[diagnosis] → [specific issue]". Max 8-14 words, one idea only. Must have a parent_index pointing to a mark.
- "chain": highlighted connective phrase showing reasoning flow. Standalone (no parent).

MARK TYPES:
- tick (✓): correct/valid point → sentiment="positive"
- cross (✗): incorrect/invalid → sentiment="negative" (ONLY when marks were lost)
- underline: applied or contextualised knowledge → sentiment="positive"
- double_underline: developed reasoning or analysis chain → sentiment="positive" or "partial"
- box: precise technical term or key concept → sentiment="positive"
- circle: vague/unclear term → sentiment="negative" (ONLY when marks were lost)

COMMENT FORMAT (STRICT):
- Format: "[diagnosis] → [specific issue]"
- Max 8-14 words, one idea only
- Reference the specific mark point or skill, not generic feedback
- Positive: "correct — matches mark point 2", "clear application to case"
- Negative: "weak analysis → no consequence stated", "missing — needed link to data"
- NEVER write negative comments for answers that scored full marks

DENSITY:
- Target ${density.min}-${density.max} annotations total for this ${maxScore}-mark question
- Maximum ${density.maxComments} margin comments
- For full marks: fewer annotations is better — just confirm correctness
- Avoid over-marking

ANCHORING:
- anchor_start and anchor_end are token indices from the OCR token list above
- anchor_start is the first token index (inclusive), anchor_end is the last (inclusive)
- Choose the minimal span that captures the annotated phrase (1-5 tokens typically)
- Each annotation must anchor to a different token span (no overlapping ranges)
- anchor_start must be <= anchor_end
- Both must be valid indices (0 to ${tokens.length - 1})

PARENT LINKING:
- Tags and comments MUST include parent_index pointing to the index of their parent mark in the annotations array
- Marks and chains do NOT have parent_index

GLOBAL RULES:
- CRITICAL: Annotation sentiment MUST match the score — do not contradict the grading result
- NEVER invent weaknesses that don't exist
- NEVER invent annotations for content not in the answer
- NEVER write long explanations or repeat the same comment
- ALWAYS anchor to specific text from the student answer
- ALWAYS prefer short + precise over verbose
</AnnotationRules>

<Instructions>
Analyse the student answer against the mark scheme and mark point results. Place annotations that show this answer has been carefully read and evaluated. Output valid JSON matching the schema.
Return annotations ordered by reading position (ascending token index).
</Instructions>`
}
