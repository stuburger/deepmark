import { z } from "zod";

export const GetExamSessionByIdSchema = {
  session_id: z.string().describe("The ID of the exam session to retrieve"),
};
