import { MarkTick } from "./mark-ornaments"
import { SectionHeading } from "./section-heading"

const points = [
	"Detailed, annotated feedback on every script",
	"Clear strengths and next steps",
	"Guidance students can actually use",
]

export function StudentImpactSection() {
	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
				<div className="bg-ruled-paper relative overflow-hidden rounded-md border border-border-quiet px-8 py-14 shadow-tile sm:px-12 sm:py-16">
					<SectionHeading align="left">Better for students too</SectionHeading>

					<ul className="mt-10 space-y-5">
						{points.map((point) => (
							<li key={point} className="flex items-start gap-4">
								<MarkTick className="mt-1 size-6 shrink-0 text-error-500 [transform:rotate(-12deg)]" />
								<span className="text-lg text-foreground">{point}</span>
							</li>
						))}
					</ul>

					<p className="mt-12 max-w-2xl text-balance text-lg font-medium text-foreground">
						The kind of feedback you'd give — if you had the time.
					</p>
				</div>
			</div>
		</section>
	)
}
