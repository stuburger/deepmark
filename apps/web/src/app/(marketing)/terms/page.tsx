import type { Metadata } from "next"

import { PolicyLayout } from "../_components/policy-layout"
import Content from "./content.mdx"

export const metadata: Metadata = {
	title: "Terms — DeepMark",
	description: "Terms of service for DeepMark, the AI-assisted marking tool.",
}

export default function TermsPage() {
	return (
		<PolicyLayout title="Terms of Service" lastUpdated="2026-05-01">
			<Content />
		</PolicyLayout>
	)
}
