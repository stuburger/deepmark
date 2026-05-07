import { SectionHeading } from "./section-heading"

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

function initials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("")
}

function Avatar({ name }: { name: string }) {
	return (
		<span
			aria-hidden
			className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-medium text-muted-foreground"
		>
			{initials(name)}
		</span>
	)
}

function Attribution({ name, role }: Pick<Testimonial, "name" | "role">) {
	return (
		<figcaption className="mt-auto flex items-center gap-3 border-t border-border-quiet pt-4">
			<Avatar name={name} />
			<span className="flex flex-col">
				<span className="text-sm font-medium text-foreground">{name}</span>
				<span className="text-xs text-muted-foreground">{role}</span>
			</span>
		</figcaption>
	)
}

export function TestimonialsSection() {
	const [featured, ...supporting] = testimonials

	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
				<SectionHeading>What teachers are saying</SectionHeading>

				<figure className="relative mt-14 overflow-hidden rounded-md border border-border-quiet bg-card p-8 shadow-tile sm:p-12">
					<span
						aria-hidden
						className="pointer-events-none absolute -left-4 -top-10 select-none font-mono text-[12rem] font-bold leading-none text-teal-50"
					>
						&ldquo;
					</span>
					<blockquote className="relative text-xl leading-relaxed text-foreground sm:text-2xl">
						{featured.quote}
					</blockquote>
					<Attribution name={featured.name} role={featured.role} />
				</figure>

				<div className="mt-5 grid gap-5 md:grid-cols-2">
					{supporting.map((t) => (
						<figure
							key={t.name}
							className="flex h-full flex-col gap-6 rounded-md border border-border-quiet bg-card p-6 shadow-tile"
						>
							<blockquote className="text-base leading-relaxed text-foreground">
								&ldquo;{t.quote}&rdquo;
							</blockquote>
							<Attribution name={t.name} role={t.role} />
						</figure>
					))}
				</div>
			</div>
		</section>
	)
}
