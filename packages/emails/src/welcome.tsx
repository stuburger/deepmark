import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"

export type WelcomeEmailProps = {
	firstName: string | null
	trialPaperCap: number
	dashboardUrl: string
	logoUrl?: string
}

export function WelcomeEmail({
	firstName,
	trialPaperCap,
	dashboardUrl,
	logoUrl,
}: WelcomeEmailProps) {
	const greeting = firstName ? `Hi ${firstName},` : "Hi,"
	return (
		<Layout
			preview={`Welcome to DeepMark — ${trialPaperCap} papers on the house to start you off.`}
			logoUrl={logoUrl}
		>
			<Heading>Welcome to DeepMark.</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>
				DeepMark gives GCSE teachers examiner-quality marking from a scan of the
				question paper, the mark scheme, and your students' scripts. Upload,
				click mark, get a class-worth of feedback in minutes.
			</Paragraph>

			<Paragraph>
				You've got <strong>{trialPaperCap} papers</strong> to mark on the house
				— no card needed. That's enough to test a real mock against your usual
				workload.
			</Paragraph>

			<CTA href={dashboardUrl}>Mark your first paper</CTA>

			<Paragraph muted style={{ marginTop: "24px" }}>
				If you've got questions, just reply to this email — it lands in our
				inbox.
			</Paragraph>
		</Layout>
	)
}
