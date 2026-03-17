import { z } from "zod"

export const RetriggerPdfIngestionJobSchema = {
	job_id: z.string().describe("ID of the PDF ingestion job to retrigger"),
}
