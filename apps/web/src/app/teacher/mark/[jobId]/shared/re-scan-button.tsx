"use client"

import { Button } from "@/components/ui/button"
import { retriggerOcr } from "@/lib/mark-actions"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function ReScanButton({ jobId }: { jobId: string }) {
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleRescan() {
		setLoading(true)
		setError(null)
		const result = await retriggerOcr(jobId)
		if (!result.ok) {
			setError(result.error)
			setLoading(false)
			return
		}
		router.refresh()
	}

	return (
		<div className="flex flex-col items-start gap-1">
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onClick={() => void handleRescan()}
			>
				{loading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
				Re-scan pages
			</Button>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	)
}
