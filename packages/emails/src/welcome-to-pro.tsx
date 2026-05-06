import { CTA } from "./_components/CTA"
import { DiscountLine } from "./_components/DiscountLine"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import type { ActiveDiscount } from "./discount"

export type WelcomeToProEmailProps = {
	firstName: string | null
	standardPriceLabel: string
	discount: ActiveDiscount | null
	monthlyGrantSize: number
	dashboardUrl: string
	billingUrl: string
	logoUrl?: string
}

export function WelcomeToProEmail({
	firstName,
	standardPriceLabel,
	discount,
	monthlyGrantSize,
	dashboardUrl,
	billingUrl,
	logoUrl,
}: WelcomeToProEmailProps) {
	const greeting = firstName
		? `Welcome to Pro, ${firstName}.`
		: "Welcome to Pro."
	return (
		<Layout
			preview={`You're on DeepMark Pro — ${monthlyGrantSize} papers a month, ready when you are.`}
			logoUrl={logoUrl}
		>
			<Heading>{greeting}</Heading>

			<Paragraph>
				Your half-term just got quieter. Pro is built for the teacher whose
				marking pile never empties — {monthlyGrantSize} papers a month, covering
				two full classes with room to spare.
			</Paragraph>

			<DiscountLine
				discount={discount}
				planLabel="Pro"
				standardPriceLabel={standardPriceLabel}
			/>

			<Paragraph>
				If exam season pushes you over the cap, top-ups are available in-app —
				15 papers for the price of a coffee round.
			</Paragraph>

			<CTA href={dashboardUrl}>Open your dashboard</CTA>

			<Paragraph muted style={{ marginTop: "24px" }}>
				Manage billing, switch plans, or cancel any time from{" "}
				<a href={billingUrl}>your billing settings</a>.
			</Paragraph>
		</Layout>
	)
}
