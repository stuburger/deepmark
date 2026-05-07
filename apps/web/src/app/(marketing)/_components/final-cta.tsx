import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

import { MarkTick, WavyUnderline } from "./mark-ornaments"

export function FinalCta() {
	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-5xl px-6 pb-24 pt-12 sm:pb-32 sm:pt-16">
				<div className="relative rounded-xl border border-border-quiet bg-card px-6 py-20 text-center shadow-tile sm:py-24">
					<MarkTick
						aria-hidden
						className="absolute -left-4 -top-5 size-12 text-error-500 [transform:rotate(-22deg)] sm:-left-6 sm:-top-7 sm:size-14"
					/>

					<h2 className="text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-6xl">
						Get your{" "}
						<span className="relative inline-block whitespace-nowrap">
							life
							<WavyUnderline className="absolute -bottom-1.5 left-0 h-2 w-full text-error-500 sm:-bottom-2 sm:h-2.5" />
						</span>{" "}
						back.
					</h2>
					<p className="mx-auto mt-6 max-w-md text-balance text-base text-muted-foreground sm:text-lg">
						Mark your first 20 papers free — no card required.
					</p>
					<div className="mt-10">
						<Link
							href="/login"
							className={buttonVariants({
								size: "lg",
								className: "shadow-btn",
							})}
						>
							Try DeepMark
						</Link>
					</div>
				</div>
			</div>
		</section>
	)
}
