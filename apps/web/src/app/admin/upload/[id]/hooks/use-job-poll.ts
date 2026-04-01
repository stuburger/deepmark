"use client"

import {
	type PdfIngestionJobDetail,
	getPdfIngestionJobDetail,
} from "@/lib/pdf-ingestion/job-lifecycle"
import { useCallback, useEffect, useState } from "react"
import { TERMINAL } from "../job-status-config"

export function useJobPoll(
	jobId: string,
	initialJob: PdfIngestionJobDetail,
): PdfIngestionJobDetail {
	const [job, setJob] = useState(initialJob)

	const poll = useCallback(async () => {
		const result = await getPdfIngestionJobDetail(jobId)
		if (result.ok) setJob(result.job)
	}, [jobId])

	useEffect(() => {
		if (TERMINAL.has(job.status)) return
		const interval = setInterval(poll, 3000)
		return () => clearInterval(interval)
	}, [job.status, poll])

	return job
}
