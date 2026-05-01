import type { Metadata } from "next"

import { PolicyStub } from "../_components/policy-stub"

export const metadata: Metadata = {
	title: "Terms — DeepMark",
	description: "DeepMark terms of service.",
}

export default function TermsPage() {
	return (
		<PolicyStub
			title="Terms of service"
			description="Our terms of service are in preparation and will be published here ahead of launch."
		/>
	)
}
