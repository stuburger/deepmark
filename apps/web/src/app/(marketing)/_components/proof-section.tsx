import type { MarketingStats } from "../_lib/papers-marked"

import { SectionHeading } from "./section-heading"

type Props = {
	stats: MarketingStats
}

type Stat = {
	value: string
	label: string
	rotate: string
}

function formatStat(n: number): string {
	if (n >= 1000) {
		return n.toLocaleString()
	}
	return n.toString()
}

export function ProofSection({ stats }: Props) {
	const items: Stat[] = [
		{
			value: formatStat(stats.papersMarked),
			label: "papers marked",
			rotate: "[transform:rotate(-1.4deg)]",
		},
		{
			value: formatStat(stats.hoursSaved),
			label: "hours saved",
			rotate: "[transform:rotate(0.8deg)]",
		},
		{
			value: `${formatStat(stats.personalizedComments)}+`,
			label: "personalised comments generated",
			rotate: "[transform:rotate(-0.5deg)]",
		},
	]

	return (
		<section className="marketing-reveal">
			<div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
				<SectionHeading>Used by real teachers, right now</SectionHeading>
				<div className="mt-14 grid gap-5 sm:grid-cols-3">
					{items.map((item) => (
						<div
							key={item.label}
							className={`flex flex-col gap-2 rounded-md border border-border-quiet bg-card p-6 shadow-tile transition-transform hover:[transform:rotate(0deg)] ${item.rotate}`}
						>
							<span className="font-mono text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
								{item.value}
							</span>
							<span className="text-sm text-muted-foreground">
								{item.label}
							</span>
						</div>
					))}
				</div>
				<p className="mt-12 text-center text-sm italic text-muted-foreground">
					Quietly giving teachers their evenings back.
				</p>
			</div>
		</section>
	)
}
