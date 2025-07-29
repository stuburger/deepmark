import { ObjectId } from "mongodb";
import { db } from "../client";

export interface Question {
  _id: ObjectId;
  text: string;
  topic: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  subject: "biology" | "chemistry" | "physics" | "english";
  points?: number;
  difficulty_level?: "easy" | "medium" | "hard" | "expert";
  // Removed parent_question_ids and part_label as they're now in question_parts collection
}

export const questions = db.collection<Question>("questions");
