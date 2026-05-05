type Testimonial = {
	quote: string
	name: string
	role: string
}

const testimonials: Testimonial[] = [
	{
		quote:
			"A set of 30 Year 10 GCSE papers would take most of a weekend. I ran them through DeepMark, reviewed everything, checked every script, and had them ready that night.",
		name: "Geoff Waugh",
		role: "GCSE Business Teacher",
	},
	{
		quote:
			"The feedback was more detailed than I'd have time to write. The students actually read it — which doesn't always happen.",
		name: "Mr DeMoor",
		role: "GCSE Business & Sociology Teacher",
	},
	{
		quote:
			"I was sceptical. I'd tried ChatGPT and Copilot — it looked convincing, but I didn't trust it. After one set with DeepMark, I'm not going back to marking by hand.",
		name: "Mrs Harding",
		role: "GCSE English Teacher",
	},
]

export function TestimonialsSection() {
	return (
		<section className="border-b border-border/40">
			<div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					What teachers are saying
				</h2>
				<div className="mt-10 space-y-8">
					{testimonials.map((t) => (
						<figure key={t.name} className="border-l-2 border-border pl-5">
							<blockquote className="text-base italic text-muted-foreground sm:text-lg">
								&ldquo;{t.quote}&rdquo;
							</blockquote>
							<figcaption className="mt-3 text-sm font-medium text-foreground">
								{t.name}
								<span className="ml-2 font-normal text-muted-foreground">
									— {t.role}
								</span>
							</figcaption>
						</figure>
					))}
				</div>
			</div>
		</section>
	)
}
