import { z } from "zod";

export const UpdateExamPaperSchema = {
  exam_paper_id: z.string().describe("The ID of the exam paper to update"),
  title: z.string().optional().describe("The updated title of the exam paper"),
  subject: z
    .enum(["biology", "chemistry", "physics", "english"])
    .optional()
    .describe("Updated subject area for the exam paper"),
  year: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("The updated year of the exam paper"),
  paper_number: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Updated paper number if there are multiple papers"),
  duration_minutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Updated duration of the exam in minutes"),
  sections: z
    .array(
      z.object({
        title: z.string().describe("Section title (e.g., 'Section A')"),
        description: z
          .string()
          .optional()
          .describe("Optional description for the section"),
        questions: z
          .array(z.string())
          .describe("Array of question IDs in order"),
        total_marks: z
          .number()
          .int()
          .positive()
          .describe("Total marks for this section"),
        instructions: z
          .string()
          .optional()
          .describe("Instructions for this section"),
      })
    )
    .optional()
    .describe("Updated array of sections with their questions"),
  metadata: z
    .object({
      difficulty_level: z.enum(["foundation", "higher"]).optional(),
      tier: z.enum(["foundation", "higher"]).optional(),
      season: z.enum(["summer", "autumn", "winter"]).optional(),
    })
    .optional()
    .describe("Updated optional metadata for the exam paper"),
  is_active: z
    .boolean()
    .optional()
    .describe("Whether the exam paper is active"),
};
