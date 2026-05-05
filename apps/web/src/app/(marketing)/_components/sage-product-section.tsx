const valuePoints = [
	"A full class marked in under an hour",
	"Next-day feedback instead of next week",
	"Consistent marking across every script",
	"Clear, structured, actionable feedback",
	"Less fatigue — without lowering your standards",
	"More energy for teaching, and for life",
]

export function SageProductSection() {
	return (
		<section className="border-b border-border/40 bg-muted/20">
			<div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					This isn't about working harder
				</h2>
				<div className="mt-6 space-y-4 text-base text-muted-foreground sm:text-lg">
					<p>It's about how much one person can realistically do — properly.</p>
					<p className="font-medium text-foreground">
						So we created a better way to get marking done.
					</p>
					<p>
						DeepMark produces a full set of marked scripts in minutes. You
						review it, judge it, edit as much as you like — and stay in full
						control.
					</p>
				</div>

				<h3 className="mt-12 text-xl font-semibold tracking-tight sm:text-2xl">
					What this actually gives you
				</h3>
				<ul className="mt-6 space-y-3">
					{valuePoints.map((point) => (
						<li key={point} className="flex items-start gap-3">
							<span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
							<span className="text-base text-muted-foreground">{point}</span>
						</li>
					))}
				</ul>
				<p className="mt-8 font-medium text-foreground">
					You stay in control. You just get your time back.
				</p>
			</div>
		</section>
	)
}
