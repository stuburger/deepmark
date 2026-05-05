import { BarChart3 } from "lucide-react"

export default function UsageSettingsPage() {
	return (
		<div className="flex flex-col items-center gap-3 py-16 text-center">
			<BarChart3 className="size-8 text-primary" />
			<h2 className="font-editorial text-[clamp(24px,3vw,32px)] leading-[1.1] tracking-[-0.01em] text-foreground">
				Usage is coming.
			</h2>
			<p className="max-w-[480px] text-[13px] text-muted-foreground">
				Paper meter, period consumption, and ledger history. Wire-up in
				progress.
			</p>
		</div>
	)
}
