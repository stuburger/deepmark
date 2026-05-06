import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type TopupThankYouEmailProps = {
	firstName: string | null
	papersAdded: number
	priceLabel: string
	dashboardUrl: string
	logoUrl?: string
}

export function TopupThankYouEmail({
	firstName,
	papersAdded,
	priceLabel,
	dashboardUrl,
	logoUrl,
}: TopupThankYouEmailProps) {
	const greeting = firstName ? `Topped up, ${firstName}.` : "Topped up."
	return (
		<Layout
			preview={`${papersAdded} extra papers added on top of your monthly Pro allowance.`}
			logoUrl={logoUrl}
		>
			<Heading>You've topped up your Pro allowance.</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>
				Exam season pushing you over the {papersAdded === 15 ? "60-paper" : ""}{" "}
				cap is what top-ups are for. Your {papersAdded} extra papers are now
				live — no expiry, ready alongside your monthly allowance.
			</Paragraph>

			<SummaryRow label="Papers added" value={String(papersAdded)} />
			<SummaryRow label="Charged" value={priceLabel} />

			<CTA href={dashboardUrl}>Back to marking</CTA>
		</Layout>
	)
}
