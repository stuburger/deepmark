import { SectionHeading } from "./section-heading"

export function GetTimeBackSection() {
	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
				<SectionHeading align="left">Get your time back</SectionHeading>
				<div className="mt-8 space-y-5 text-lg text-muted-foreground sm:text-xl">
					<p>Marking costs you evenings, weekends, and energy.</p>
					<p className="border-l-2 border-primary pl-5 font-medium text-foreground">
						You're already paying for marking.
						<br />
						Just not with money.
					</p>
				</div>
			</div>
		</section>
	)
}
