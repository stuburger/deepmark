import { CTA } from "./_components/CTA"
import { Heading } from "./_components/Heading"
import { Layout } from "./_components/Layout"
import { Paragraph } from "./_components/Paragraph"
import { SummaryRow } from "./_components/SummaryRow"

export type ResourceSharedEmailProps = {
	/** First name of the person receiving the share notification, or null. */
	recipientFirstName: string | null
	/** Display name of the person who initiated the share, or null if unknown. */
	sharedByName: string | null
	/** Email of the person who initiated the share — shown as fallback copy when name is null. */
	sharedByEmail: string
	resourceType: "exam_paper" | "student_submission"
	/** Title of the shared resource — exam paper title or student's name + paper. */
	resourceTitle: string
	role: "owner" | "editor" | "viewer"
	/** URL the recipient lands on when they click the CTA. */
	resourceUrl: string
	logoUrl?: string
}

// ─── Copy spec ────────────────────────────────────────────────────────────────
//
// Two axes drive this email:
//   - resourceType : exam_paper vs student_submission — drives the heading,
//                   CTA label, and what you can do with access.
//   - role         : owner / editor / viewer — drives the role label shown in
//                   the summary row.
//
// The sharer display uses name when available, falls back to email.

type Role = "owner" | "editor" | "viewer"
type ResourceType = "exam_paper" | "student_submission"

const ROLE_LABEL: Record<Role, string> = {
	owner: "Owner",
	editor: "Can edit",
	viewer: "Can view",
}

type ResourceCopy = {
	/** "an exam paper" / "a student submission" */
	typeLabel: string
	/** What you can do with the access — short sentence fragment. */
	accessDescription: string
	ctaLabel: string
}

const RESOURCE_COPY: Record<ResourceType, ResourceCopy> = {
	exam_paper: {
		typeLabel: "an exam paper",
		accessDescription: "mark scripts, review results, and manage submissions.",
		ctaLabel: "Open paper",
	},
	student_submission: {
		typeLabel: "a student submission",
		accessDescription: "review the student's answers, feedback, and marks.",
		ctaLabel: "View submission",
	},
}

function buildCopy(
	sharedBy: string,
	resourceTitle: string,
	resourceType: ResourceType,
): { subject: string; preview: string; heading: string; body: string } {
	const { typeLabel, accessDescription } = RESOURCE_COPY[resourceType]
	const subject = `${sharedBy} shared "${resourceTitle}" with you`
	const preview = subject
	const heading = `You've been given access to ${typeLabel}.`
	const body = `${sharedBy} has shared "${resourceTitle}" with you. Open it to ${accessDescription}`
	return { subject, preview, heading, body }
}

export function buildResourceSharedCopy(
	props: Pick<
		ResourceSharedEmailProps,
		"sharedByName" | "sharedByEmail" | "resourceTitle" | "resourceType"
	>,
): { subject: string } {
	const sharedBy = props.sharedByName ?? props.sharedByEmail
	const { subject } = buildCopy(
		sharedBy,
		props.resourceTitle,
		props.resourceType,
	)
	return { subject }
}

export function ResourceSharedEmail({
	recipientFirstName,
	sharedByName,
	sharedByEmail,
	resourceType,
	resourceTitle,
	role,
	resourceUrl,
	logoUrl,
}: ResourceSharedEmailProps) {
	const sharedBy = sharedByName ?? sharedByEmail
	const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,"
	const { preview, heading, body } = buildCopy(
		sharedBy,
		resourceTitle,
		resourceType,
	)
	const { ctaLabel } = RESOURCE_COPY[resourceType]

	return (
		<Layout preview={preview} logoUrl={logoUrl}>
			<Heading>{heading}</Heading>

			<Paragraph>{greeting}</Paragraph>

			<Paragraph>{body}</Paragraph>

			<SummaryRow label="Shared by" value={sharedBy} />
			<SummaryRow label="Resource" value={resourceTitle} />
			<SummaryRow label="Access" value={ROLE_LABEL[role]} />

			<CTA href={resourceUrl}>{ctaLabel}</CTA>
		</Layout>
	)
}
