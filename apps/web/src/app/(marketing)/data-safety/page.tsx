import type { Metadata } from "next"

import { PolicyLayout } from "../_components/policy-layout"
import Content from "./content.mdx"

export const metadata: Metadata = {
	title: "Data & Safety — DeepMark",
	description:
		"How DeepMark handles student work: UK-hosted, encrypted, never used to train AI models.",
}

export default function DataSafetyPage() {
	return (
		<PolicyLayout title="Student Data & Safety" lastUpdated="2026-05-01">
			<Content />
		</PolicyLayout>
	)
}
