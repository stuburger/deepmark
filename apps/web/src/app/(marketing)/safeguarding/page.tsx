import type { Metadata } from "next"

import { PolicyStub } from "../_components/policy-stub"

export const metadata: Metadata = {
	title: "Safeguarding — DeepMark",
	description:
		"DeepMark safeguarding and Keeping Children Safe in Education (KCSiE) policy.",
}

export default function SafeguardingPage() {
	return (
		<PolicyStub
			title="Safeguarding"
			description="Our Keeping Children Safe in Education (KCSiE) policy — covering disclosure handling, escalation routes, and our duty of care — is in preparation and will be published here ahead of launch."
		/>
	)
}
