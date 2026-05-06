import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type WelcomeToUnlimitedEmailProps = {
	firstName: string | null
	standardPriceLabel: string
	dashboardUrl: string
	billingUrl: string
	logoUrl?: string
}

export function WelcomeToUnlimitedEmail({
	firstName,
	standardPriceLabel,
	dashboardUrl,
	billingUrl,
	logoUrl,
}: WelcomeToUnlimitedEmailProps) {
	const greeting = firstName
		? `Welcome to Unlimited, ${firstName}.`
		: "Welcome to Unlimited."
	return (
		<Layout
			preview="You're on DeepMark Unlimited — no caps, no limits, mark as much as you like."
			logoUrl={logoUrl}
		>
			<Heading>{greeting}</Heading>

			<Paragraph>
				No paper caps. No top-ups to think about. Whatever's on your marking
				pile, run it through.
			</Paragraph>

			<SummaryRow label="Plan" value="Unlimited" />
			<SummaryRow label="Price" value={`${standardPriceLabel}/month`} />
			<SummaryRow label="Paper allowance" value="Unlimited" />

			<CTA href={dashboardUrl}>Open your dashboard</CTA>

			<Paragraph muted style={{ marginTop: "24px" }}>
				Manage billing, switch plans, or cancel any time from{" "}
				<a href={billingUrl}>your billing settings</a>.
			</Paragraph>
		</Layout>
	)
}
