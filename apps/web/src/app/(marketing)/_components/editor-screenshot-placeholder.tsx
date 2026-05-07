import { BrowserFrame } from "./browser-frame"
import { MarkTick } from "./mark-ornaments"

export function EditorScreenshotPlaceholder() {
	return (
		<BrowserFrame url="deepmark.io/marking">
			<div
				className="relative aspect-[16/10] overflow-hidden bg-muted"
				style={{
					backgroundImage: "var(--texture-image)",
					backgroundSize: "var(--texture-size)",
				}}
			>
				<div className="absolute inset-0 grid grid-cols-[64px_1fr_240px] gap-3 p-4">
					<div className="flex flex-col gap-2">
						<div className="h-9 rounded bg-card shadow-tile-quiet" />
						<div className="h-9 rounded bg-card" />
						<div className="h-9 rounded bg-card" />
						<div className="h-9 rounded bg-card" />
					</div>

					<div className="relative flex flex-col gap-3 rounded-md bg-card p-5 shadow-tile-quiet">
						<div className="flex items-center gap-2">
							<div className="h-3 w-32 rounded bg-ink-200" />
							<div className="ml-auto flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
								<span>8</span>
								<span className="text-ink-300">/</span>
								<span>12</span>
							</div>
						</div>
						<div className="space-y-2 pt-1">
							<div className="h-2 w-[92%] rounded bg-ink-100" />
							<div className="relative h-2 w-[88%] rounded bg-ink-100">
								<MarkTick className="absolute -right-6 -top-1 size-4 text-error-500 [transform:rotate(-14deg)]" />
							</div>
							<div className="relative h-2 w-[78%] rounded bg-ink-100">
								<div className="absolute inset-x-0 -bottom-1 h-px bg-primary" />
							</div>
							<div className="h-2 w-[84%] rounded bg-ink-100" />
							<div className="relative h-2 w-[60%] rounded bg-ink-100">
								<MarkTick className="absolute -right-6 -top-1 size-4 text-error-500 [transform:rotate(-14deg)]" />
							</div>
						</div>
						<div className="mt-2 flex gap-1.5">
							<div className="h-4 w-12 rounded-sm bg-teal-50" />
							<div className="h-4 w-14 rounded-sm bg-warning-50" />
							<div className="h-4 w-10 rounded-sm bg-success-50" />
						</div>
					</div>

					<div className="flex flex-col gap-2 rounded-md bg-card p-3 shadow-tile-quiet">
						<div className="flex items-center justify-between">
							<div className="h-2.5 w-16 rounded bg-ink-200" />
							<div className="font-mono text-[10px] tabular-nums text-muted-foreground">
								8/12
							</div>
						</div>
						<div className="space-y-1.5 rounded border-l-2 border-primary bg-teal-50/50 p-2">
							<div className="h-1.5 w-2/3 rounded bg-teal-200" />
							<div className="h-1.5 w-full rounded bg-ink-100" />
							<div className="h-1.5 w-3/4 rounded bg-ink-100" />
						</div>
						<div className="space-y-1.5 rounded p-2">
							<div className="h-1.5 w-1/2 rounded bg-ink-200" />
							<div className="h-1.5 w-full rounded bg-ink-100" />
						</div>
						<div className="space-y-1.5 rounded p-2">
							<div className="h-1.5 w-2/5 rounded bg-ink-200" />
							<div className="h-1.5 w-full rounded bg-ink-100" />
						</div>
					</div>
				</div>

				<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-border bg-card/95 px-3 py-1 backdrop-blur-sm">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
						Editor preview · screenshot coming soon
					</span>
				</div>
			</div>
		</BrowserFrame>
	)
}
