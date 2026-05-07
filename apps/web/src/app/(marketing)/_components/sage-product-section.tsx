import { MarkTick } from "./mark-ornaments"
import { SectionHeading } from "./section-heading"

const valuePoints = [
	"A full class marked in under an hour",
	"Next-day feedback instead of next week",
	"Consistent marking across every script",
	"Clear, structured, actionable feedback",
	"Less fatigue — without lowering your standards",
	"More energy for teaching, and for life",
]

const tileRotations = [
	"[transform:rotate(-0.5deg)]",
	"[transform:rotate(0.4deg)]",
	"[transform:rotate(-0.3deg)]",
	"[transform:rotate(0.6deg)]",
	"[transform:rotate(-0.6deg)]",
	"[transform:rotate(0.3deg)]",
] as const

export function SageProductSection() {
	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
				<SectionHeading>What this actually gives you</SectionHeading>
				<ul className="mt-12 grid gap-4 sm:grid-cols-2">
					{valuePoints.map((point, i) => (
						<li
							key={point}
							className={`flex items-start gap-3 rounded-md border border-border-quiet bg-card p-5 shadow-tile-quiet transition-transform hover:[transform:rotate(0deg)] ${tileRotations[i]}`}
						>
							<MarkTick className="mt-0.5 size-5 shrink-0 text-error-500 [transform:rotate(-12deg)]" />
							<span className="text-base text-foreground">{point}</span>
						</li>
					))}
				</ul>
				<p className="mx-auto mt-12 max-w-2xl text-center text-balance text-lg font-medium text-foreground">
					You stay in control. You just get your time back.
				</p>
			</div>
		</section>
	)
}
