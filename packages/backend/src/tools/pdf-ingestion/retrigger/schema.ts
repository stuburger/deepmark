import { z } from "zod/v4"

export const RetriggerPdfIngestionJobSchema = {
	job_id: z.string().describe("ID of the PDF ingestion job to retrigger"),
}
