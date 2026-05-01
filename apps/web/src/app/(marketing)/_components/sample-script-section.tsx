import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Badge } from "@/components/ui/badge"

export function SampleScriptSection() {
	return (
		<section className="border-b border-border/40 bg-muted/20">
			<div className="mx-auto max-w-6xl px-6 py-24">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
						What you'd write — done for you.
					</h2>
					<p className="mt-4 text-base text-muted-foreground">
						Marks awarded against the scheme. Feedback annotated on the original
						handwriting. Rationale you can audit, not a black box.
					</p>
				</div>
				<div className="mt-14">
					<AspectRatio
						ratio={16 / 9}
						className="overflow-hidden rounded-lg border border-border/60 bg-muted/40"
					>
						<div className="flex h-full items-center justify-center">
							<Badge variant="secondary">Sample marked-script preview</Badge>
						</div>
					</AspectRatio>
				</div>
			</div>
		</section>
	)
}
