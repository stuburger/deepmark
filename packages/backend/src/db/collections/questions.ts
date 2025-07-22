import { db } from "../client";

export interface Question {
  _id?: string;
  question_text: string;
  topic: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  subject: "biology" | "chemistry" | "physics" | "english";
  points?: number;
  difficulty_level?: "easy" | "medium" | "hard" | "expert";
}

export const questions = db.collection<Question>("questions");
