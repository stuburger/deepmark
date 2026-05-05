const points = [
	"Detailed, annotated feedback on every script",
	"Clear strengths and next steps",
	"Guidance students can actually use",
]

export function StudentImpactSection() {
	return (
		<section className="border-b border-border/40 bg-muted/20">
			<div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					Better for students too
				</h2>
				<ul className="mt-6 space-y-3">
					{points.map((point) => (
						<li key={point} className="flex items-start gap-3">
							<span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
							<span className="text-base text-muted-foreground">{point}</span>
						</li>
					))}
				</ul>
				<p className="mt-8 font-medium text-foreground">
					The kind of feedback you'd give — if you had the time.
				</p>
			</div>
		</section>
	)
}
