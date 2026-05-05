import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

export function HeroSection() {
	return (
		<section className="relative overflow-hidden border-b border-border/40">
			<div className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
						Get your life back.
					</h1>
					<p className="mt-6 text-balance text-lg text-muted-foreground sm:text-xl">
						<strong className="font-semibold text-foreground">
							Marking over the weekend isn't normal.
						</strong>
						<br />
						We've just collectively agreed to pretend it is.
					</p>
					<p className="mt-4 text-balance text-base text-muted-foreground sm:text-lg">
						Mark a full class in under an hour — with consistent, actionable
						feedback for every student, and more depth than you could
						realistically write.
					</p>
					<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Link href="/login" className={buttonVariants({ size: "lg" })}>
							Try DeepMark
						</Link>
					</div>
					<p className="mt-4 text-sm text-muted-foreground">
						Mark your first 20 papers free — no card required.
					</p>
				</div>
			</div>
		</section>
	)
}
