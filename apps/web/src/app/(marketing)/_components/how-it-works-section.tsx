import { SectionHeading } from "./section-heading"

const steps = [
	"Scan your scripts (printer or reprographics)",
	"Upload with question paper + mark scheme",
	"DeepMark marks everything in minutes",
	"Review, judge, and edit",
	"Print and hand back",
]

export function HowItWorksSection() {
	return (
		<section id="how-it-works" className="marketing-reveal">
			<div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
				<SectionHeading>How it works</SectionHeading>

				<ol className="relative mx-auto mt-16 grid max-w-5xl gap-x-3 gap-y-12 sm:grid-cols-5 sm:gap-x-4">
					<div
						aria-hidden
						className="pointer-events-none absolute left-[10%] right-[10%] top-5 hidden border-t-2 border-dashed border-border-quiet sm:block"
					/>

					{steps.map((step, i) => (
						<li
							key={step}
							className="relative z-10 flex flex-col items-center text-center"
						>
							<span className="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-card font-mono text-xs font-semibold tabular-nums text-primary shadow-tile-quiet">
								{String(i + 1).padStart(2, "0")}
							</span>
							<span className="mt-4 max-w-[16ch] text-sm leading-relaxed text-foreground">
								{step}
							</span>
						</li>
					))}
				</ol>

				<p className="mx-auto mt-16 max-w-2xl text-center text-balance text-lg font-medium text-foreground">
					What used to take a week can now be done in a PPA period.
				</p>
			</div>
		</section>
	)
}
