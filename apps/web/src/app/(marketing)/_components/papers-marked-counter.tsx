type Props = {
	count: number
}

export function PapersMarkedCounter({ count }: Props) {
	return (
		<div className="inline-flex items-baseline gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-1.5 text-sm">
			<span className="font-semibold tabular-nums">
				{count.toLocaleString()}
			</span>
			<span className="text-muted-foreground">papers marked so far</span>
		</div>
	)
}
