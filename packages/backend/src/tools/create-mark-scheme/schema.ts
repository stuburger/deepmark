import { z } from "zod";

const MarkPointSchema = z.object({
  point_number: z
    .number()
    .int()
    .positive()
    .describe("The number of the mark point"),
  description: z.string().describe("Description of the mark point"),
  points: z.literal(1).describe("Each mark point is worth 1 point"),
  criteria: z.string().describe("Criteria for awarding the mark point"),
});

export const CreateMarkSchemeSchema = {
  question_id: z
    .string()
    .describe("The ID of the question this mark scheme is for"),
  question_part_id: z
    .string()
    .optional()
    .describe(
      "The ID of the specific question part this mark scheme is for (optional - omit for whole question mark schemes)"
    ),
  description: z
    .string()
    .describe("Description of what this mark scheme is for"),
  guidance: z
    .string()
    .optional()
    .describe(
      "Marking guidance for the LLM on how to apply this mark scheme to the question"
    ),
  points_total: z
    .number()
    .int()
    .positive()
    .describe("Total number of points for the mark scheme"),
  mark_points: z.array(MarkPointSchema).describe("Array of mark points"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Array of tags to categorize and organize the mark scheme"),
};
