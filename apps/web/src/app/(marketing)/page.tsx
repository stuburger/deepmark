import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { CaregiverSection } from "./_components/caregiver-section"
import { FinalCta } from "./_components/final-cta"
import { HeroSection } from "./_components/hero-section"
import { HowItWorksSection } from "./_components/how-it-works-section"
import { PricingStrip } from "./_components/pricing-strip"
import { SageProductSection } from "./_components/sage-product-section"
import { SampleScriptSection } from "./_components/sample-script-section"
import { getPapersMarkedCount } from "./_lib/papers-marked"

export const metadata: Metadata = {
	title: "DeepMark — Examiner-quality GCSE marking",
	description:
		"Marking all weekend isn't normal. DeepMark grades your GCSE scripts to examiner standard — so you get your evenings back.",
}

export default async function LandingPage() {
	const session = await auth()
	if (session) {
		redirect("/teacher")
	}

	const papersMarked = await getPapersMarkedCount()

	return (
		<>
			<HeroSection papersMarked={papersMarked} />
			<CaregiverSection />
			<SageProductSection />
			<SampleScriptSection />
			<HowItWorksSection />
			<PricingStrip />
			<FinalCta />
		</>
	)
}
