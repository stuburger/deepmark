import type { MarketingStats } from "../_lib/papers-marked"

type Props = {
	stats: MarketingStats
}

type Stat = {
	value: string
	label: string
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
		},
		{
			value: formatStat(stats.hoursSaved),
			label: "hours saved",
		},
		{
			value: `${formatStat(stats.personalizedComments)}+`,
			label: "personalised comments generated",
		},
	]

	return (
		<section className="border-b border-border/40 bg-muted/20">
			<div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
				<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
					Used by real teachers, right now
				</h2>
				<div className="mt-10 grid gap-8 sm:grid-cols-3">
					{items.map((item) => (
						<div key={item.label} className="flex flex-col items-center gap-1">
							<span className="font-mono text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
								{item.value}
							</span>
							<span className="text-sm text-muted-foreground">
								{item.label}
							</span>
						</div>
					))}
				</div>
				<p className="mt-10 text-sm italic text-muted-foreground">
					Quietly giving teachers their evenings back.
				</p>
			</div>
		</section>
	)
}
