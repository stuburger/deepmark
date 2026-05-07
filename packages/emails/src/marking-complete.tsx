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

type Copy = {
	preview: string
	heading: string
	body: string
	scriptsLabel: string
	cta: string
}

function buildCopy({
	kind,
	successCount,
	failedCount,
	examPaperTitle,
}: Pick<
	MarkingCompleteEmailProps,
	"kind" | "successCount" | "failedCount" | "examPaperTitle"
>): Copy {
	const total = successCount + failedCount
	const allFailed = total > 0 && successCount === 0
	const partialFailed = failedCount > 0 && successCount > 0
	const isRegrade = kind === "re_grade"

	if (allFailed) {
		return {
			preview: `Marking failed — none of ${total} script${total === 1 ? "" : "s"} could be processed for ${examPaperTitle}.`,
			heading:
				total === 1
					? "Your script couldn't be marked."
					: "We couldn't mark any of your scripts.",
			body:
				total === 1
					? "DeepMark wasn't able to process this script. Open the submissions tab to retry — usually a re-extract clears it."
					: "DeepMark wasn't able to process any of these scripts. Open the submissions tab to retry — usually a re-extract clears them.",
			scriptsLabel: total === 1 ? "Script" : "Scripts",
			cta: "Review submissions",
		}
	}

	if (partialFailed) {
		const verb = isRegrade ? "regraded" : "marked"
		return {
			preview: `${successCount}/${total} scripts ${verb} for ${examPaperTitle} — ${failedCount} couldn't be processed.`,
			heading: isRegrade
				? "Your regrades are in (mostly)."
				: "Your batch is ready (mostly).",
			body: `DeepMark finished ${successCount} of ${total} scripts for ${examPaperTitle}. ${failedCount === 1 ? "One couldn't" : `${failedCount} couldn't`} be processed — open the submissions tab to retry the ${failedCount === 1 ? "failure" : "failures"}.`,
			scriptsLabel: "Scripts",
			cta: "Review submissions",
		}
	}

	if (isRegrade) {
		return {
			preview: `${successCount} regraded script${successCount === 1 ? "" : "s"} ready for ${examPaperTitle}.`,
			heading: "Your regrades are ready to review.",
			body: `DeepMark has finished regrading ${successCount === 1 ? "your script" : `your ${successCount} scripts`}. Open the submissions tab to compare against the previous mark.`,
			scriptsLabel: successCount === 1 ? "Script" : "Scripts",
			cta: "Review regrades",
		}
	}

	return {
		preview: `Your batch is ready — ${successCount} script${successCount === 1 ? "" : "s"} marked for ${examPaperTitle}.`,
		heading: "Your batch is ready to review.",
		body: "DeepMark has finished marking your latest batch. Open the submissions tab to read examiner feedback, override marks, and export grades.",
		scriptsLabel: successCount === 1 ? "Script" : "Scripts",
		cta: "Review submissions",
	}
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
	const copy = buildCopy({ kind, successCount, failedCount, examPaperTitle })
	const total = successCount + failedCount

	return (
		<Layout preview={copy.preview} logoUrl={logoUrl}>
			<Heading>{copy.heading}</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>{copy.body}</Paragraph>

			<SummaryRow label="Paper" value={examPaperTitle} />
			<SummaryRow label={copy.scriptsLabel} value={String(total)} />
			{failedCount > 0 && (
				<SummaryRow label="Couldn't process" value={String(failedCount)} />
			)}

			<CTA href={submissionsUrl}>{copy.cta}</CTA>
		</Layout>
	)
}
