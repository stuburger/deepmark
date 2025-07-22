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

export const UpdateMarkSchemeSchema = z.object({
  id: z
    .string()
    .describe("The unique identifier for the mark scheme to update"),
  points_total: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Total number of points for the mark scheme"),
  mark_points: z
    .array(MarkPointSchema)
    .optional()
    .describe("Array of mark points"),
});
