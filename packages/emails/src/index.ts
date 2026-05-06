/**
 * Public API for `@mcp-gcse/emails`. Consumed by:
 *  - `packages/backend/src/processors/email-subscriber.ts` (Lambda render +
 *    SES send)
 *  - `apps/web/src/app/admin/emails/page.tsx` (Geoff's preview surface)
 *  - `packages/backend/src/billing/active-discount.ts` (imports the
 *    `ActiveDiscount` type so producer + consumer can't drift)
 *
 * react-email CLI (`bun --cwd packages/emails preview`) reads templates by
 * filename — it doesn't go through this barrel.
 */

export { ActiveDiscount, formatDiscountSentence } from "./discount"
export {
	EventDetailType,
	EventSource,
	type BatchCompletedDetail,
	type EventDetailTypeValue,
	type PpuPurchasedDetail,
	type SubscriptionUpgradedDetail,
	type TopupPurchasedDetail,
	type UserSignedUpDetail,
} from "./event-payloads"
export {
	MarkingCompleteEmail,
	type MarkingCompleteEmailProps,
} from "./marking-complete"
export {
	PpuThankYouEmail,
	type PpuThankYouEmailProps,
} from "./ppu-thank-you"
export {
	TopupThankYouEmail,
	type TopupThankYouEmailProps,
} from "./topup-thank-you"
export { WelcomeEmail, type WelcomeEmailProps } from "./welcome"
export {
	WelcomeToProEmail,
	type WelcomeToProEmailProps,
} from "./welcome-to-pro"
export {
	WelcomeToUnlimitedEmail,
	type WelcomeToUnlimitedEmailProps,
} from "./welcome-to-unlimited"
export {
	type RenderedEmail,
	renderMarkingCompleteEmail,
	renderPpuThankYouEmail,
	renderTopupThankYouEmail,
	renderWelcomeEmail,
	renderWelcomeToProEmail,
	renderWelcomeToUnlimitedEmail,
} from "./render"
