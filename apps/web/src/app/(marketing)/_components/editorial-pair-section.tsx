import { SectionHeading } from "./section-heading"

export function EditorialPairSection() {
	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
				<div className="grid gap-14 md:grid-cols-12 md:gap-x-10 md:gap-y-0">
					<div className="md:col-span-5 md:col-start-1">
						<SectionHeading align="left">
							You already know how this works
						</SectionHeading>
						<div className="mt-8 space-y-5 text-lg text-muted-foreground sm:text-xl">
							<p>Teaching isn't one job.</p>
							<p>
								You're doing crowd control, coaching, therapy, role model, admin
								— making thousands of decisions, all day, every day.
							</p>
							<p>
								Then you get home.
								<br />
								And there's nothing left.
							</p>
							<p>
								Now you're supposed to mark.
								<br />
								Carefully. Consistently. Properly.
							</p>
							<p>
								At night.
								<br />
								On weekends.
							</p>
							<p className="border-l-2 border-primary pl-5 font-medium text-foreground">
								Not because you're inefficient.
								<br />
								Because that's how it gets done.
							</p>
						</div>
					</div>

					<div className="md:col-span-5 md:col-start-8 md:row-start-1 md:mt-28">
						<SectionHeading align="left">
							This isn't about working harder
						</SectionHeading>
						<div className="mt-8 space-y-5 text-lg text-muted-foreground sm:text-xl">
							<p>
								It's about how much one person can realistically do — properly.
							</p>
							<p className="font-medium text-foreground">
								So we created a better way to get marking done.
							</p>
							<p>
								DeepMark produces a full set of marked scripts in minutes. You
								review it, judge it, edit as much as you like — and stay in full
								control.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
