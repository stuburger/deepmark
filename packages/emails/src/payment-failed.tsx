import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type PaymentFailedEmailProps = {
	firstName: string | null
	planLabel: string
	amountLabel: string
	/** Which retry attempt this email is for — Stripe attempts 4 times by default. */
	attemptCount: number
	/** Stripe's next automatic retry, or null if this was the final attempt. */
	nextAttemptAt: Date | null
	billingUrl: string
	logoUrl?: string
}

export function buildPaymentFailedCopy(
	props: Pick<PaymentFailedEmailProps, "attemptCount" | "nextAttemptAt">,
): { subject: string; preview: string } {
	const final = props.nextAttemptAt === null
	if (final) {
		return {
			subject: "Action needed — your DeepMark subscription is about to lapse",
			preview:
				"We've tried to charge your card and it didn't go through. Update it to keep marking.",
		}
	}
	if (props.attemptCount <= 1) {
		return {
			subject: "We couldn't charge your card",
			preview: "Update your payment method to avoid losing access.",
		}
	}
	return {
		subject: "Your DeepMark payment is still failing",
		preview: "Update your card before access pauses.",
	}
}

function formatNextAttempt(date: Date): string {
	return date.toLocaleDateString("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
	})
}

export function PaymentFailedEmail({
	firstName,
	planLabel,
	amountLabel,
	attemptCount,
	nextAttemptAt,
	billingUrl,
	logoUrl,
}: PaymentFailedEmailProps) {
	const greeting = firstName ? `Hi ${firstName},` : "Hi,"
	const { preview } = buildPaymentFailedCopy({ attemptCount, nextAttemptAt })
	const final = nextAttemptAt === null

	const heading = final
		? "Your subscription is about to lapse."
		: "We couldn't process your payment."

	const intro = final
		? `We've made ${attemptCount} attempts to renew your ${planLabel} subscription and the card keeps being declined. Update your payment method now to keep your access — otherwise it'll pause when this billing period ends.`
		: `Your card was declined when we tried to renew your ${planLabel} subscription. Most of the time this is something small — an expired card, a daily limit, a 3DS prompt that timed out. A 60-second visit to your billing settings usually sorts it.`

	const retryLine = nextAttemptAt
		? `We'll automatically try again on ${formatNextAttempt(nextAttemptAt)}. Updating your card before then will trigger a fresh attempt straight away.`
		: "There are no more automatic retries scheduled."

	return (
		<Layout preview={preview} logoUrl={logoUrl}>
			<Heading>{heading}</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>{intro}</Paragraph>

			<SummaryRow label="Plan" value={planLabel} />
			<SummaryRow label="Amount due" value={amountLabel} />
			<SummaryRow label="Attempt" value={`${attemptCount} of 4`} />

			<Paragraph>{retryLine}</Paragraph>

			<CTA href={billingUrl}>Update payment method</CTA>

			<Paragraph muted style={{ marginTop: "24px" }}>
				If you've already updated your card, you can safely ignore this email —
				the next retry will pick it up.
			</Paragraph>
		</Layout>
	)
}
