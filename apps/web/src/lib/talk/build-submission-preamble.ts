import type {
	GradingResult,
	MarkPointResult,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"

export type SubmissionPreambleInput = {
	payload: StudentPaperJobPayload
	annotations: StudentPaperAnnotation[]
}

/**
 * Renders a deterministic markdown preamble for a single submission, used as
 * the cached system context for Talk to DeepMark. Same input MUST produce
 * byte-identical output — Anthropic prompt caching depends on it, and a
 * preamble that flips order on re-render would burn cache hits every turn.
 */
export function buildSubmissionPreamble(
	input: SubmissionPreambleInput,
): string {
	const { payload, annotations } = input
	const annotationsByQuestion = groupAnnotationsByQuestion(annotations)

	const lines: string[] = []

	lines.push("# Submission")
	lines.push("")
	lines.push(`- Student: ${payload.student_name ?? "(unidentified)"}`)
	lines.push(`- Paper: ${payload.exam_paper_title ?? "(untitled paper)"}`)
	lines.push(`- Total awarded: ${payload.total_awarded} / ${payload.total_max}`)
	if (payload.tier) lines.push(`- Tier: ${payload.tier}`)
	if (payload.confirmed_at)
		lines.push(`- Confirmed: ${payload.confirmed_at.toISOString()}`)
	lines.push("")

	if (payload.examiner_summary) {
		lines.push("## Examiner summary")
		lines.push("")
		lines.push(payload.examiner_summary.trim())
		lines.push("")
	}

	if (payload.level_descriptors) {
		lines.push("## Paper-level level descriptors")
		lines.push("")
		lines.push(payload.level_descriptors.trim())
		lines.push("")
	}

	lines.push("## Questions")
	lines.push("")

	if (payload.grading_results.length === 0) {
		lines.push("_No grading results available yet._")
		lines.push("")
	}

	for (const result of payload.grading_results) {
		renderQuestion(
			lines,
			result,
			annotationsByQuestion.get(result.question_id) ?? [],
		)
	}

	return lines.join("\n")
}

function renderQuestion(
	lines: string[],
	r: GradingResult,
	questionAnnotations: StudentPaperAnnotation[],
): void {
	const method = r.marking_method ?? "unspecified"
	const excluded =
		r.included_in_total === false ? " — excluded (alternative not chosen)" : ""
	lines.push(
		`### Q${r.question_number} · ${r.awarded_score}/${r.max_score} marks · ${method}${excluded}`,
	)
	lines.push("")

	lines.push("**Question**")
	lines.push("")
	lines.push(r.question_text.trim())
	lines.push("")

	if (r.stimuli && r.stimuli.length > 0) {
		lines.push("**Stimuli**")
		lines.push("")
		for (const s of r.stimuli) {
			lines.push(`- **${s.label}** (${s.content_type})`)
			lines.push("")
			lines.push(indent(s.content.trim(), "  "))
			lines.push("")
		}
	}

	if (r.marking_method === "deterministic") {
		const opts = r.multiple_choice_options ?? []
		const correct = r.correct_option_labels ?? []
		if (opts.length > 0) {
			lines.push("**Options**")
			for (const opt of opts) {
				lines.push(`- ${opt.option_label}. ${opt.option_text}`)
			}
			lines.push("")
		}
		if (correct.length > 0) {
			lines.push(`**Correct option(s):** ${correct.join(", ")}`)
			lines.push("")
		}
	}

	lines.push("**Student answer**")
	lines.push("")
	lines.push(r.student_answer.trim() || "_(no answer extracted)_")
	lines.push("")

	if (r.level_awarded !== undefined) {
		lines.push(`**Level awarded:** ${r.level_awarded}`)
	}
	if (r.cap_applied) lines.push(`**Cap applied:** ${r.cap_applied}`)
	if (r.why_not_next_level)
		lines.push(`**Why not next level:** ${r.why_not_next_level}`)
	if (r.level_awarded !== undefined || r.cap_applied || r.why_not_next_level) {
		lines.push("")
	}

	if (r.mark_points_results && r.mark_points_results.length > 0) {
		lines.push("**Mark points**")
		const sorted = [...r.mark_points_results].sort(
			(a, b) => a.pointNumber - b.pointNumber,
		)
		for (const mp of sorted) {
			renderMarkPoint(lines, mp)
		}
		lines.push("")
	}

	if (r.ao_awards && r.ao_awards.length > 0) {
		lines.push("**AO awards**")
		for (const award of r.ao_awards) {
			lines.push(
				`- ${award.ao_code}: Level ${award.level_awarded}, ${award.awarded_marks}/${award.max_marks}`,
			)
			if (award.why_not_next_level) {
				lines.push(`  - Why not next level: ${award.why_not_next_level}`)
			}
			for (const ev of award.descriptor_evaluations) {
				const tag = ev.met ? "[MET]" : "[NOT MET]"
				lines.push(`  - ${tag} ${ev.descriptor}`)
				if (ev.evidence) lines.push(`    - Evidence: ${ev.evidence}`)
			}
		}
		lines.push("")
	}

	if (r.feedback_summary) {
		lines.push("**Feedback summary**")
		lines.push("")
		lines.push(r.feedback_summary.trim())
		lines.push("")
	}

	if (r.what_went_well && r.what_went_well.length > 0) {
		lines.push("**What went well**")
		for (const w of r.what_went_well) lines.push(`- ${w}`)
		lines.push("")
	}
	if (r.even_better_if && r.even_better_if.length > 0) {
		lines.push("**Even better if**")
		for (const w of r.even_better_if) lines.push(`- ${w}`)
		lines.push("")
	}

	if (questionAnnotations.length > 0) {
		lines.push("**Existing annotations**")
		for (const a of questionAnnotations) {
			lines.push(renderAnnotation(a))
		}
		lines.push("")
	}

	lines.push("---")
	lines.push("")
}

function renderMarkPoint(lines: string[], mp: MarkPointResult): void {
	const status = mp.awarded ? "AWARDED" : "NOT AWARDED"
	lines.push(`- MP${mp.pointNumber} [${status}] — ${mp.reasoning}`)
	if (mp.expectedCriteria) lines.push(`  - Expected: ${mp.expectedCriteria}`)
	if (mp.studentCovered) lines.push(`  - Student covered: ${mp.studentCovered}`)
}

function renderAnnotation(a: StudentPaperAnnotation): string {
	const tokenRange =
		a.anchor_token_start_id && a.anchor_token_end_id
			? `${a.anchor_token_start_id}..${a.anchor_token_end_id}`
			: "—"
	const base = `- [id=${a.id} tokens=${tokenRange} source=${a.source}]`

	if (a.overlay_type === "annotation") {
		const parts = [`signal=${a.payload.signal}`]
		if (a.payload.ao_display) parts.push(`ao=${a.payload.ao_display}`)
		else if (a.payload.ao_category) parts.push(`ao=${a.payload.ao_category}`)
		if (a.payload.ao_quality) parts.push(`quality=${a.payload.ao_quality}`)
		if (a.payload.label) parts.push(`label="${a.payload.label}"`)
		const tags = parts.join(" ")
		const comment = a.payload.comment ?? a.payload.reason ?? ""
		return `${base} ${tags}${comment ? ` — ${escapeNewlines(comment)}` : ""}`
	}

	return `${base} chain=${a.payload.chainType} phrase="${escapeNewlines(a.payload.phrase)}"`
}

function groupAnnotationsByQuestion(
	annotations: StudentPaperAnnotation[],
): Map<string, StudentPaperAnnotation[]> {
	const map = new Map<string, StudentPaperAnnotation[]>()
	for (const a of annotations) {
		const list = map.get(a.question_id) ?? []
		list.push(a)
		map.set(a.question_id, list)
	}
	return map
}

function indent(text: string, prefix: string): string {
	return text
		.split("\n")
		.map((line) => `${prefix}${line}`)
		.join("\n")
}

function escapeNewlines(text: string): string {
	return text.replace(/\s*\n\s*/g, " ").trim()
}
