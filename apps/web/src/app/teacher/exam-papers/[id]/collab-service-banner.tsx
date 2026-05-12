"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
	type CollabServiceStatus,
	getCollabStatus,
	scaleUpCollab,
} from "@/lib/collab/scale"
import { queryKeys } from "@/lib/query-keys"

/**
 * Renders a banner inside the marking job dialog on non-production stages
 * to spin up the on-demand collab Fargate service. Returns null on
 * production (`getCollabStatus` returns null there).
 *
 * Polling cadence:
 *   - desiredCount=0  → 30s (idle, low cost)
 *   - starting/running → 5s (catch state changes quickly)
 *
 * The cron auto-tears the service back down ~30 min after the last
 * scale-up; re-clicking "Start" while running refreshes that window.
 */
export function CollabServiceBanner() {
	const queryClient = useQueryClient()

	const { data: status } = useQuery<CollabServiceStatus | null>({
		queryKey: queryKeys.collabStatus(),
		queryFn: async () => {
			const result = await getCollabStatus()
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data ?? null
		},
		refetchInterval: (q) => {
			const s = q.state.data
			if (!s) return false
			if (s.desiredCount === 0) return 30_000
			return 5_000
		},
	})

	const scaleUp = useMutation({
		mutationFn: async () => {
			const result = await scaleUpCollab()
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data
		},
		onSuccess: (data) => {
			if (data) {
				queryClient.setQueryData(queryKeys.collabStatus(), data)
			}
			toast.success("Collab server starting — should be ready in ~30 seconds")
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to scale up")
		},
	})

	if (!status || !status.manageable) return null

	const running = status.desiredCount > 0 && status.runningCount > 0
	const starting = status.desiredCount > 0 && status.runningCount === 0
	const off = status.desiredCount === 0

	return (
		<div className="mx-4 mt-2 mb-1 flex items-center justify-between gap-3 rounded-md border border-border-quiet bg-muted/60 px-3 py-2 text-sm">
			<div className="flex items-center gap-2 text-ink-700">
				<span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
					{status.stage}
				</span>
				<span>·</span>
				{off && (
					<span className="text-muted-foreground">
						Collab server is asleep. Live updates won't stream until it's
						started.
					</span>
				)}
				{starting && (
					<span className="flex items-center gap-1.5 text-muted-foreground">
						<Spinner className="size-3" />
						Starting collab server…
					</span>
				)}
				{running && (
					<span className="text-muted-foreground">
						Collab running ·{" "}
						{status.autoStopsAt
							? `auto-stops at ${formatTime(status.autoStopsAt)}`
							: "auto-stop scheduled"}
					</span>
				)}
			</div>
			{off && (
				<Button
					size="sm"
					onClick={() => scaleUp.mutate()}
					disabled={scaleUp.isPending}
				>
					{scaleUp.isPending ? "Starting…" : "Start collab server"}
				</Button>
			)}
			{running && (
				<Button
					size="sm"
					variant="ghost"
					onClick={() => scaleUp.mutate()}
					disabled={scaleUp.isPending}
				>
					Extend
				</Button>
			)}
		</div>
	)
}

function formatTime(iso: string): string {
	const d = new Date(iso)
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
