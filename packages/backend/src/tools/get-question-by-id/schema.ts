import { z } from "zod";

export const GetQuestionByIdSchema = {
  id: z.string().describe("The unique identifier for the question to retrieve"),
}; 
