import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

export function FinalCta() {
	return (
		<section>
			<div className="mx-auto max-w-3xl px-6 py-24 text-center">
				<h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
					Get your life back.
				</h2>
				<p className="mt-4 text-base text-muted-foreground sm:text-lg">
					Mark your first 20 papers free — no card required.
				</p>
				<div className="mt-8">
					<Link href="/login" className={buttonVariants({ size: "lg" })}>
						Try DeepMark
					</Link>
				</div>
			</div>
		</section>
	)
}
