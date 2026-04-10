import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

/**
 * Listens for service worker messages (e.g. push notifications for batch
 * completion) and invalidates the relevant React Query caches so the UI
 * refreshes immediately without waiting for the next poll cycle.
 */
export function useSwMessages(paperId: string) {
	const queryClient = useQueryClient()

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return

		function handleMessage(event: MessageEvent) {
			if (event.data?.type === "batch-complete") {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.submissions(paperId),
				})
			}
		}

		navigator.serviceWorker.addEventListener("message", handleMessage)
		return () => {
			navigator.serviceWorker.removeEventListener("message", handleMessage)
		}
	}, [paperId, queryClient])
}
