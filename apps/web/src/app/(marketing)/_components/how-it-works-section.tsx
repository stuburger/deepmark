const steps = [
	"Scan your scripts (printer or reprographics)",
	"Upload with question paper + mark scheme",
	"DeepMark marks everything in minutes",
	"Review, judge, and edit",
	"Print and hand back",
]

export function HowItWorksSection() {
	return (
		<section id="how-it-works" className="border-b border-border/40">
			<div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					How it works
				</h2>
				<ol className="mt-8 space-y-4">
					{steps.map((step, i) => (
						<li key={step} className="flex items-start gap-4">
							<span className="mt-0.5 font-mono text-sm tabular-nums text-muted-foreground">
								{String(i + 1).padStart(2, "0")}
							</span>
							<span className="text-base text-muted-foreground">{step}</span>
						</li>
					))}
				</ol>
				<p className="mt-8 font-medium text-foreground">
					What used to take a week can now be done in a PPA period.
				</p>
			</div>
		</section>
	)
}
