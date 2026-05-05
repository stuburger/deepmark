import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { CaregiverSection } from "./_components/caregiver-section"
import { FinalCta } from "./_components/final-cta"
import { GetTimeBackSection } from "./_components/get-time-back-section"
import { HeroSection } from "./_components/hero-section"
import { HowItWorksSection } from "./_components/how-it-works-section"
import { ProofSection } from "./_components/proof-section"
import { SageProductSection } from "./_components/sage-product-section"
import { StudentImpactSection } from "./_components/student-impact-section"
import { TestimonialsSection } from "./_components/testimonials-section"
import { getMarketingStats } from "./_lib/papers-marked"

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

	const stats = await getMarketingStats()

	return (
		<>
			<HeroSection />
			<ProofSection stats={stats} />
			<CaregiverSection />
			<SageProductSection />
			<TestimonialsSection />
			<HowItWorksSection />
			<StudentImpactSection />
			<GetTimeBackSection />
			<FinalCta />
		</>
	)
}
