import {
	type RenderedEmail,
	renderMarkingCompleteEmail,
	renderPaymentFailedEmail,
	renderPpuThankYouEmail,
	renderResourceSharedEmail,
	renderTopupThankYouEmail,
	renderWelcomeEmail,
	renderWelcomeToProEmail,
	renderWelcomeToUnlimitedEmail,
} from "@mcp-gcse/emails"
import {
	markingCompleteFixtures,
	paymentFailedFixtures,
	ppuThankYouFixtures,
	resourceSharedFixtures,
	topupThankYouFixtures,
	welcomeFixtures,
	welcomeToProFixtures,
	welcomeToUnlimitedFixtures,
} from "@mcp-gcse/emails/fixtures"
import type { Metadata } from "next"

import { EmailFrame } from "./email-frame"

export const metadata: Metadata = {
	title: "Email previews — Admin",
}

/**
 * Geoff's review surface for transactional emails. Single long page, every
 * template + every interesting variant rendered into an isolated iframe so
 * the email's own styles never leak into the surrounding UI.
 *
 * Server-rendered. Each `render*Email` call lives inside `@mcp-gcse/emails`
 * — Next's `transpilePackages` follows the workspace package, so the trace
 * picks up `@react-email/render` + `@react-email/components` for the Lambda
 * bundle. Calling `render` directly from this file would put the import on
 * the apps/web side of the tree where OpenNext's tracer misses it (empty
 * iframes in production).
 */
export default async function EmailPreviewsPage() {
	const sections = await Promise.all([
		renderSection(
			"Resource shared",
			resourceSharedFixtures,
			renderResourceSharedEmail,
		),
		renderSection("Welcome", welcomeFixtures, renderWelcomeEmail),
		renderSection(
			"Welcome to Pro (with discount + variants)",
			welcomeToProFixtures,
			renderWelcomeToProEmail,
		),
		renderSection(
			"Welcome to Unlimited",
			welcomeToUnlimitedFixtures,
			renderWelcomeToUnlimitedEmail,
		),
		renderSection(
			"Payment failed (dunning)",
			paymentFailedFixtures,
			renderPaymentFailedEmail,
		),
		renderSection("PPU thank-you", ppuThankYouFixtures, renderPpuThankYouEmail),
		renderSection(
			"Top-up thank-you",
			topupThankYouFixtures,
			renderTopupThankYouEmail,
		),
		renderSection(
			"Marking complete",
			markingCompleteFixtures,
			renderMarkingCompleteEmail,
		),
	])

	return (
		<div className="mx-auto max-w-5xl space-y-12 p-8">
			<header>
				<h1 className="text-3xl font-semibold tracking-tight">
					Email previews
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Every transactional template, rendered with realistic seed data. Each
					variant is sandboxed in its own iframe — what you see is what a user
					receives.
				</p>
			</header>

			{sections.map((section) => (
				<section key={section.title}>
					<h2 className="text-xl font-semibold">{section.title}</h2>
					<div className="mt-4 space-y-8">
						{section.variants.map((variant) => (
							<div key={variant.label}>
								<h3 className="mb-2 text-sm font-medium text-muted-foreground">
									{variant.label}
								</h3>
								<EmailFrame html={variant.html} />
							</div>
						))}
					</div>
				</section>
			))}
		</div>
	)
}

type Variant = { label: string; html: string }
type Section = { title: string; variants: Variant[] }

async function renderSection<TProps>(
	title: string,
	fixtures: Record<string, TProps>,
	renderFn: (props: TProps) => Promise<RenderedEmail>,
): Promise<Section> {
	const variants = await Promise.all(
		Object.entries(fixtures).map(async ([label, props]) => {
			const rendered = await renderFn(props)
			return { label, html: rendered.html }
		}),
	)
	return { title, variants }
}
