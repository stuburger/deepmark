import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type PpuThankYouEmailProps = {
	firstName: string | null
	papersAdded: number
	priceLabel: string
	dashboardUrl: string
	logoUrl?: string
}

export function PpuThankYouEmail({
	firstName,
	papersAdded,
	priceLabel,
	dashboardUrl,
	logoUrl,
}: PpuThankYouEmailProps) {
	const greeting = firstName ? `Thanks, ${firstName}.` : "Thanks."
	return (
		<Layout
			preview={`Your ${papersAdded} papers are ready to mark.`}
			logoUrl={logoUrl}
		>
			<Heading>One set of papers, ready when you are.</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>
				Your pay-per-use set has been added to your account. Run a question
				paper, your class's scripts, and your usual mark scheme through it — one
				mock, one batch, no subscription.
			</Paragraph>

			<SummaryRow label="Papers added" value={String(papersAdded)} />
			<SummaryRow label="Charged" value={priceLabel} />

			<CTA href={dashboardUrl}>Start marking</CTA>
		</Layout>
	)
}
