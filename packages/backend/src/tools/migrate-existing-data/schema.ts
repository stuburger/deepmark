import { z } from "zod";

export const MigrateExistingDataSchema = {
  source_format: z
    .enum(["json", "csv", "excel"])
    .describe("The format of the source data to migrate"),
  source_data: z
    .string()
    .describe(
      "The source data content (JSON string, CSV content, or base64 encoded Excel)"
    ),
  target_collection: z
    .enum([
      "questions",
      "exam_papers",
      "mark_schemes",
      "exam_sessions",
      "answers",
    ])
    .describe("The target collection to migrate data into"),
  validation_mode: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to run in validation mode (dry run) without actually inserting data"
    ),
};
