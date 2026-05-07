import { Skeleton } from "@/components/ui/skeleton"

export function ResultsPanelSkeleton() {
	return (
		<div className="h-full w-full overflow-hidden bg-muted">
			<div className="space-y-5 p-4">
				<QuestionCardSkeleton lines={3} />
				<QuestionCardSkeleton lines={2} />
				<QuestionCardSkeleton lines={4} />
			</div>
		</div>
	)
}

function QuestionCardSkeleton({ lines }: { lines: number }) {
	return (
		<div className="rounded-md border border-border bg-card p-4">
			<div className="mb-3 flex items-center justify-between">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-5 w-12 rounded-md" />
			</div>
			<div className="space-y-2">
				{Array.from({ length: lines }).map((_, i) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						key={i}
						className="h-3 w-full"
						style={{ width: `${70 + ((i * 13) % 25)}%` }}
					/>
				))}
			</div>
		</div>
	)
}
