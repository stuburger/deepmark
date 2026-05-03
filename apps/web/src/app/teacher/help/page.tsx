import { Sparkles } from "lucide-react"

export default function HelpPage() {
	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3 px-2 py-24 text-center">
			<Sparkles className="size-8 text-primary" />
			<h1 className="font-editorial text-[clamp(28px,4vw,40px)] leading-[1.1] tracking-[-0.01em] text-foreground">
				Help is coming.
			</h1>
			<p className="max-w-[480px] text-[13px] text-muted-foreground">
				Guides, walkthroughs, and a way to reach the team. Until then, ask
				DeepMark anything from the dashboard.
			</p>
		</div>
	)
}
