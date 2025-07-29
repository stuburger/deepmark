import { z } from "zod";

export const CreateQuestionPartSchema = {
  question_id: z
    .string()
    .describe("The ID of the parent question to create a part for"),
  part_label: z.string().describe("The part label (e.g., 'a', 'b', 'c')"),
  part_text: z.string().describe("The text for this specific question part"),
  part_points: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Number of marks for this specific part (optional, defaults to parent question points)"
    ),
  part_difficulty_level: z
    .enum(["easy", "medium", "hard", "expert"])
    .optional()
    .describe(
      "Difficulty level for this specific part (optional, defaults to parent question difficulty)"
    ),
};
