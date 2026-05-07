import { Skeleton } from "@/components/ui/skeleton"

export function SubmissionToolbarSkeleton() {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
			<div className="flex items-center gap-3">
				<Skeleton className="h-8 w-8 rounded-md" />
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-4 w-4 rounded-sm" />
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-6 w-12 rounded-md" />
				<Skeleton className="h-6 w-10 rounded-md" />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-8 w-20 rounded-md" />
				<Skeleton className="h-8 w-8 rounded-md" />
				<Skeleton className="h-8 w-8 rounded-md" />
			</div>
		</div>
	)
}
