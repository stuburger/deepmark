import type { Metadata } from "next"

import { PolicyStub } from "../_components/policy-stub"

export const metadata: Metadata = {
	title: "Privacy — DeepMark",
	description:
		"DeepMark privacy and data-handling policy. GDPR-compliant; full policy in preparation.",
}

export default function PrivacyPage() {
	return (
		<PolicyStub
			title="Privacy"
			description="Our full GDPR / data-handling policy is in preparation and will be published here ahead of launch."
		/>
	)
}
