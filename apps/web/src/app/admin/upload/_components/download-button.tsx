"use client"

import { Button } from "@/components/ui/button"
import { getPdfIngestionJobDownloadUrl } from "@/lib/pdf-ingestion-actions"
import { Download } from "lucide-react"
import { useState } from "react"

export function DownloadButton({ jobId }: { jobId: string }) {
	const [loading, setLoading] = useState(false)

	async function handleClick() {
		setLoading(true)
		try {
			const result = await getPdfIngestionJobDownloadUrl(jobId)
			if (result.ok) {
				window.open(result.url, "_blank", "noopener,noreferrer")
			}
		} finally {
			setLoading(false)
		}
	}

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			onClick={handleClick}
			disabled={loading}
		>
			<Download />
			<span className="sr-only">Download PDF</span>
		</Button>
	)
}
