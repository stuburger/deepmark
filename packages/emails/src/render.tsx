import { render } from "@react-email/render"

import {
	MarkingCompleteEmail,
	buildMarkingCompleteCopy,
} from "./marking-complete"
import type { MarkingCompleteEmailProps } from "./marking-complete"
import { PpuThankYouEmail } from "./ppu-thank-you"
import type { PpuThankYouEmailProps } from "./ppu-thank-you"
import { ResourceSharedEmail, buildResourceSharedCopy } from "./resource-shared"
import type { ResourceSharedEmailProps } from "./resource-shared"
import { TopupThankYouEmail } from "./topup-thank-you"
import type { TopupThankYouEmailProps } from "./topup-thank-you"
import { WelcomeEmail } from "./welcome"
import type { WelcomeEmailProps } from "./welcome"
import { WelcomeToProEmail } from "./welcome-to-pro"
import type { WelcomeToProEmailProps } from "./welcome-to-pro"
import { WelcomeToUnlimitedEmail } from "./welcome-to-unlimited"
import type { WelcomeToUnlimitedEmailProps } from "./welcome-to-unlimited"

export type RenderedEmail = {
	subject: string
	html: string
	text: string
}

async function renderBoth(node: React.ReactElement, subject: string) {
	const [html, text] = await Promise.all([
		render(node),
		render(node, { plainText: true }),
	])
	return { subject, html, text }
}

export async function renderWelcomeEmail(
	props: WelcomeEmailProps,
): Promise<RenderedEmail> {
	return renderBoth(
		<WelcomeEmail {...props} />,
		"Welcome to DeepMark — your first papers are on the house",
	)
}

export async function renderWelcomeToProEmail(
	props: WelcomeToProEmailProps,
): Promise<RenderedEmail> {
	return renderBoth(<WelcomeToProEmail {...props} />, "Welcome to DeepMark Pro")
}

export async function renderWelcomeToUnlimitedEmail(
	props: WelcomeToUnlimitedEmailProps,
): Promise<RenderedEmail> {
	return renderBoth(
		<WelcomeToUnlimitedEmail {...props} />,
		"Welcome to DeepMark Unlimited",
	)
}

export async function renderPpuThankYouEmail(
	props: PpuThankYouEmailProps,
): Promise<RenderedEmail> {
	return renderBoth(
		<PpuThankYouEmail {...props} />,
		`Your ${props.papersAdded} papers are ready`,
	)
}

export async function renderTopupThankYouEmail(
	props: TopupThankYouEmailProps,
): Promise<RenderedEmail> {
	return renderBoth(
		<TopupThankYouEmail {...props} />,
		`Top-up confirmed — ${props.papersAdded} extra papers added`,
	)
}

export async function renderMarkingCompleteEmail(
	props: MarkingCompleteEmailProps,
): Promise<RenderedEmail> {
	const { subject } = buildMarkingCompleteCopy(props)
	return renderBoth(<MarkingCompleteEmail {...props} />, subject)
}

export async function renderResourceSharedEmail(
	props: ResourceSharedEmailProps,
): Promise<RenderedEmail> {
	const { subject } = buildResourceSharedCopy(props)
	return renderBoth(<ResourceSharedEmail {...props} />, subject)
}
