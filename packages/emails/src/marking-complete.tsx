import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"
import type { ProcessingBatchKind } from "./event-payloads"

export type MarkingCompleteEmailProps = {
	firstName: string | null
	examPaperTitle: string
	kind: ProcessingBatchKind
	successCount: number
	failedCount: number
	submissionsUrl: string
	logoUrl?: string
}

// ─── Copy spec ───────────────────────────────────────────────────────────────
//
// Two orthogonal axes drive the email's tone:
//   - mode    : initial upload or a teacher-triggered re-grade. `re_extract`
//               collapses to `initial` because the user-facing meaning is the
//               same ("we ran the full pipeline on these scripts").
//   - outcome : every script succeeded, some failed, or every one failed.
//
// Each (mode, outcome) cell is a self-contained chunk of copy. Geoff edits
// strings in one cell at a time without touching control flow.

type Mode = "initial" | "regrade"
type Outcome = "all_success" | "partial_failure" | "all_failure"

type CopyContext = {
	examPaperTitle: string
	successCount: number
	failedCount: number
}

type Copy = {
	subject: string
	preview: string
	heading: string
	body: string
	cta: string
}

function classifyMode(kind: ProcessingBatchKind): Mode {
	return kind === "re_grade" ? "regrade" : "initial"
}

function classifyOutcome(success: number, failed: number): Outcome {
	if (success === 0 && failed > 0) return "all_failure"
	if (failed > 0) return "partial_failure"
	return "all_success"
}

const COPY: Record<Mode, Record<Outcome, (ctx: CopyContext) => Copy>> = {
	initial: {
		all_success: ({ examPaperTitle, successCount }) => ({
			subject: `Marking complete — ${examPaperTitle}`,
			preview: `Your batch is ready — ${successCount} script${successCount === 1 ? "" : "s"} marked for ${examPaperTitle}.`,
			heading: "Your batch is ready to review.",
			body: "DeepMark has finished marking your latest batch. Open the submissions tab to read examiner feedback, override marks, and export grades.",
			cta: "Review submissions",
		}),
		partial_failure: ({ examPaperTitle, successCount, failedCount }) => {
			const total = successCount + failedCount
			return {
				subject: `Marking complete — ${examPaperTitle}`,
				preview: `${successCount}/${total} scripts marked for ${examPaperTitle} — ${failedCount} couldn't be processed.`,
				heading: "Your batch is ready (mostly).",
				body: `DeepMark finished ${successCount} of ${total} scripts for ${examPaperTitle}. ${failedCount === 1 ? "One couldn't" : `${failedCount} couldn't`} be processed — open the submissions tab to retry the ${failedCount === 1 ? "failure" : "failures"}.`,
				cta: "Review submissions",
			}
		},
		all_failure: ({ examPaperTitle, failedCount }) => ({
			subject: `Marking failed — ${examPaperTitle}`,
			preview: `Marking failed — none of ${failedCount} script${failedCount === 1 ? "" : "s"} could be processed for ${examPaperTitle}.`,
			heading:
				failedCount === 1
					? "Your script couldn't be marked."
					: "We couldn't mark any of your scripts.",
			body:
				failedCount === 1
					? "DeepMark wasn't able to process this script. Open the submissions tab to retry — usually a re-extract clears it."
					: "DeepMark wasn't able to process any of these scripts. Open the submissions tab to retry — usually a re-extract clears them.",
			cta: "Review submissions",
		}),
	},
	regrade: {
		all_success: ({ examPaperTitle, successCount }) => ({
			subject: `Regrades complete — ${examPaperTitle}`,
			preview: `${successCount} regraded script${successCount === 1 ? "" : "s"} ready for ${examPaperTitle}.`,
			heading: "Your regrades are ready to review.",
			body: `DeepMark has finished regrading ${successCount === 1 ? "your script" : `your ${successCount} scripts`}. Open the submissions tab to compare against the previous mark.`,
			cta: "Review regrades",
		}),
		partial_failure: ({ examPaperTitle, successCount, failedCount }) => {
			const total = successCount + failedCount
			return {
				subject: `Regrades complete — ${examPaperTitle}`,
				preview: `${successCount}/${total} scripts regraded for ${examPaperTitle} — ${failedCount} couldn't be processed.`,
				heading: "Your regrades are in (mostly).",
				body: `DeepMark finished regrading ${successCount} of ${total} scripts for ${examPaperTitle}. ${failedCount === 1 ? "One couldn't" : `${failedCount} couldn't`} be processed — open the submissions tab to retry.`,
				cta: "Review regrades",
			}
		},
		all_failure: ({ examPaperTitle, failedCount }) => ({
			subject: `Regrades failed — ${examPaperTitle}`,
			preview: `None of ${failedCount} regraded script${failedCount === 1 ? "" : "s"} for ${examPaperTitle} could be processed.`,
			heading:
				failedCount === 1
					? "Your regrade couldn't be processed."
					: "We couldn't regrade any of your scripts.",
			body:
				failedCount === 1
					? "DeepMark wasn't able to regrade this script. Open the submissions tab to retry."
					: "DeepMark wasn't able to regrade any of these scripts. Open the submissions tab to retry.",
			cta: "Review submissions",
		}),
	},
}

/**
 * Single source of truth for the marking-complete email — used by the
 * component (heading/body/preview/cta) and by `renderMarkingCompleteEmail`
 * (subject). Pure function: same args always produce same Copy.
 */
export function buildMarkingCompleteCopy(
	args: CopyContext & { kind: ProcessingBatchKind },
): Copy {
	const mode = classifyMode(args.kind)
	const outcome = classifyOutcome(args.successCount, args.failedCount)
	return COPY[mode][outcome](args)
}

export function MarkingCompleteEmail({
	firstName,
	examPaperTitle,
	kind,
	successCount,
	failedCount,
	submissionsUrl,
	logoUrl,
}: MarkingCompleteEmailProps) {
	const greeting = firstName ? `Hi ${firstName},` : "Hi,"
	const copy = buildMarkingCompleteCopy({
		kind,
		examPaperTitle,
		successCount,
		failedCount,
	})
	const total = successCount + failedCount
	const scriptsLabel = total === 1 ? "Script" : "Scripts"

	return (
		<Layout preview={copy.preview} logoUrl={logoUrl}>
			<Heading>{copy.heading}</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>{copy.body}</Paragraph>

			<SummaryRow label="Paper" value={examPaperTitle} />
			<SummaryRow label={scriptsLabel} value={String(total)} />
			{failedCount > 0 && (
				<SummaryRow label="Couldn't process" value={String(failedCount)} />
			)}

			<CTA href={submissionsUrl}>{copy.cta}</CTA>
		</Layout>
	)
}
