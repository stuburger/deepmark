import type { Metadata } from "next"

import { PolicyLayout } from "../_components/policy-layout"
import Content from "./content.mdx"

export const metadata: Metadata = {
	title: "Safeguarding — DeepMark",
	description:
		"How DeepMark works with schools to protect children, in line with KCSiE.",
}

export default function SafeguardingPage() {
	return (
		<PolicyLayout title="Safeguarding Policy" lastUpdated="2026-05-01">
			<Content />
		</PolicyLayout>
	)
}
