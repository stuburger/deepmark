import type { Metadata } from "next"

import { PolicyLayout } from "../_components/policy-layout"
import Content from "./content.mdx"

export const metadata: Metadata = {
	title: "Privacy — DeepMark",
	description:
		"How DeepMark collects, uses, and protects personal data, in accordance with UK GDPR.",
}

export default function PrivacyPage() {
	return (
		<PolicyLayout title="Privacy Policy" lastUpdated="2026-05-01">
			<Content />
		</PolicyLayout>
	)
}
