import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type MarkingCompleteEmailProps = {
	firstName: string | null
	examPaperTitle: string
	studentCount: number
	submissionsUrl: string
	logoUrl?: string
}

export function MarkingCompleteEmail({
	firstName,
	examPaperTitle,
	studentCount,
	submissionsUrl,
	logoUrl,
}: MarkingCompleteEmailProps) {
	const greeting = firstName ? `Hi ${firstName},` : "Hi,"
	const scriptWord = studentCount === 1 ? "script" : "scripts"
	return (
		<Layout
			preview={`Your batch is ready — ${studentCount} ${scriptWord} marked for ${examPaperTitle}.`}
			logoUrl={logoUrl}
		>
			<Heading>Your batch is ready to review.</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>
				DeepMark has finished marking your latest batch. Open the submissions
				tab to read examiner feedback, override marks, and export grades.
			</Paragraph>

			<SummaryRow label="Paper" value={examPaperTitle} />
			<SummaryRow
				label={scriptWord === "script" ? "Script" : "Scripts"}
				value={String(studentCount)}
			/>

			<CTA href={submissionsUrl}>Review submissions</CTA>
		</Layout>
	)
}
