import { getPdfIngestionJobDetail } from "@/lib/pdf-ingestion-actions"
import { notFound } from "next/navigation"
import { JobStatusPage } from "./job-status-client"

export default async function PdfIngestionJobDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getPdfIngestionJobDetail(id)
	if (!result.ok) {
		if (result.error === "Job not found") notFound()
		return <p className="p-8 text-sm text-destructive">{result.error}</p>
	}

	return <JobStatusPage initialJob={result.job} jobId={id} />
}
