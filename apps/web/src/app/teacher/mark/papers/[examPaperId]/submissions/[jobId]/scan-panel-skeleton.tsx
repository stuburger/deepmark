import { Skeleton } from "@/components/ui/skeleton"

export function ScanPanelSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				<Skeleton className="h-6 w-16 rounded-md" />
				<Skeleton className="h-6 w-6 rounded-md" />
				<Skeleton className="h-6 w-6 rounded-md" />
				<div className="ml-auto flex items-center gap-2">
					<Skeleton className="h-6 w-6 rounded-md" />
					<Skeleton className="h-6 w-6 rounded-md" />
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
				<Skeleton className="aspect-[1/1.4] w-full" />
				<Skeleton className="aspect-[1/1.4] w-full" />
			</div>
		</div>
	)
}
