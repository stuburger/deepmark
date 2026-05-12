import type { MarkingCompleteEmailProps } from "./marking-complete"
import type { PpuThankYouEmailProps } from "./ppu-thank-you"
import type { ResourceSharedEmailProps } from "./resource-shared"
import type { TopupThankYouEmailProps } from "./topup-thank-you"
import type { WelcomeEmailProps } from "./welcome"
import type { WelcomeToProEmailProps } from "./welcome-to-pro"
import type { WelcomeToUnlimitedEmailProps } from "./welcome-to-unlimited"

/**
 * Sample props for every template. Used by:
 *  - the in-app preview page at /admin/emails (Geoff's review surface)
 *  - the react-email CLI dev server (developer iteration)
 *  - the snapshot tests in packages/emails/tests
 *
 * Keep variants realistic: a founders-discount upgrade is what most pro
 * welcome emails will look like at launch, so it gets the "default" slot.
 */

const WEB_URL = "https://getdeepmark.com"
const SIX_MONTHS_FROM_NOW = new Date(
	new Date("2026-05-06").getTime() + 1000 * 60 * 60 * 24 * 30 * 6,
)

export const welcomeFixtures: Record<string, WelcomeEmailProps> = {
	default: {
		firstName: "Sarah",
		trialPaperCap: 20,
		dashboardUrl: `${WEB_URL}/teacher`,
	},
	noFirstName: {
		firstName: null,
		trialPaperCap: 20,
		dashboardUrl: `${WEB_URL}/teacher`,
	},
}

export const welcomeToProFixtures: Record<string, WelcomeToProEmailProps> = {
	founders: {
		firstName: "Sarah",
		standardPriceLabel: "£24",
		discount: {
			amountOff: 1440,
			standardAmount: 2400,
			currency: "gbp",
			endsAt: SIX_MONTHS_FROM_NOW,
		},
		monthlyGrantSize: 60,
		dashboardUrl: `${WEB_URL}/teacher`,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
	},
	standard: {
		firstName: "Sarah",
		standardPriceLabel: "£24",
		discount: null,
		monthlyGrantSize: 60,
		dashboardUrl: `${WEB_URL}/teacher`,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
	},
	usdNoDiscount: {
		firstName: "Alex",
		standardPriceLabel: "$30",
		discount: null,
		monthlyGrantSize: 60,
		dashboardUrl: `${WEB_URL}/teacher`,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
	},
}

export const welcomeToUnlimitedFixtures: Record<
	string,
	WelcomeToUnlimitedEmailProps
> = {
	default: {
		firstName: "Sarah",
		standardPriceLabel: "£49",
		dashboardUrl: `${WEB_URL}/teacher`,
		billingUrl: `${WEB_URL}/teacher/settings/billing`,
	},
}

export const ppuThankYouFixtures: Record<string, PpuThankYouEmailProps> = {
	gbp: {
		firstName: "Sarah",
		papersAdded: 30,
		priceLabel: "£10",
		dashboardUrl: `${WEB_URL}/teacher`,
	},
	usd: {
		firstName: "Alex",
		papersAdded: 30,
		priceLabel: "$13",
		dashboardUrl: `${WEB_URL}/teacher`,
	},
}

export const topupThankYouFixtures: Record<string, TopupThankYouEmailProps> = {
	default: {
		firstName: "Sarah",
		papersAdded: 15,
		priceLabel: "£6.50",
		dashboardUrl: `${WEB_URL}/teacher`,
	},
}

export const resourceSharedFixtures: Record<string, ResourceSharedEmailProps> =
	{
		examPaperViewer: {
			recipientFirstName: "Alex",
			sharedByName: "Sarah Patel",
			sharedByEmail: "sarah.patel@school.com",
			resourceType: "exam_paper",
			resourceTitle: "AQA GCSE Business — Paper 1, June 2024",
			role: "viewer",
			resourceUrl: `${WEB_URL}/teacher/exam-papers/abc123`,
		},
		examPaperEditor: {
			recipientFirstName: "Alex",
			sharedByName: "Sarah Patel",
			sharedByEmail: "sarah.patel@school.com",
			resourceType: "exam_paper",
			resourceTitle: "AQA GCSE Business — Paper 1, June 2024",
			role: "editor",
			resourceUrl: `${WEB_URL}/teacher/exam-papers/abc123`,
		},
		examPaperOwner: {
			recipientFirstName: null,
			sharedByName: "Sarah Patel",
			sharedByEmail: "sarah.patel@school.com",
			resourceType: "exam_paper",
			resourceTitle: "AQA GCSE Business — Paper 1, June 2024",
			role: "owner",
			resourceUrl: `${WEB_URL}/teacher/exam-papers/abc123`,
		},
		submissionViewer: {
			recipientFirstName: "Alex",
			sharedByName: null,
			sharedByEmail: "sarah.patel@school.com",
			resourceType: "student_submission",
			resourceTitle: "Zack Müller — AQA GCSE Business Paper 1",
			role: "viewer",
			resourceUrl: `${WEB_URL}/teacher/exam-papers/abc123/submissions/sub456`,
		},
		submissionEditor: {
			recipientFirstName: "Alex",
			sharedByName: "Sarah Patel",
			sharedByEmail: "sarah.patel@school.com",
			resourceType: "student_submission",
			resourceTitle: "Zack Müller — AQA GCSE Business Paper 1",
			role: "editor",
			resourceUrl: `${WEB_URL}/teacher/exam-papers/abc123/submissions/sub456`,
		},
	}

export const markingCompleteFixtures: Record<
	string,
	MarkingCompleteEmailProps
> = {
	wholeClass: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "initial",
		successCount: 28,
		failedCount: 0,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
	singleScript: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "initial",
		successCount: 1,
		failedCount: 0,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
	partialFailure: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "initial",
		successCount: 25,
		failedCount: 3,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
	allFailed: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "initial",
		successCount: 0,
		failedCount: 4,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
	regrade: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "re_grade",
		successCount: 12,
		failedCount: 0,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
	reExtract: {
		firstName: "Sarah",
		examPaperTitle: "AQA GCSE Business — Paper 1, June 2024",
		kind: "re_extract",
		successCount: 1,
		failedCount: 0,
		submissionsUrl: `${WEB_URL}/teacher/exam-papers/abc123?tab=submissions`,
	},
}
