import { z } from "zod";

export const StartExamSessionSchema = {
  exam_paper_id: z
    .string()
    .describe("The ID of the exam paper to start a session for"),
  student_id: z.string().describe("The ID of the student taking the exam"),
  metadata: z
    .object({
      location: z
        .string()
        .optional()
        .describe("Location where the exam is being taken"),
      invigilator: z.string().optional().describe("Name of the invigilator"),
      special_requirements: z
        .array(z.string())
        .optional()
        .describe("Array of special requirements for the student"),
    })
    .optional()
    .describe("Optional metadata for the exam session"),
};
