import { ObjectId } from "mongodb";
import { db } from "../client";

export interface ExamSession {
  _id: ObjectId;
  exam_paper_id: ObjectId;
  student_id: string;
  started_at: Date;
  completed_at?: Date;
  status: "in_progress" | "completed" | "abandoned";
  total_score?: number;
  max_possible_score: number;
  metadata?: {
    location?: string;
    invigilator?: string;
    special_requirements?: string[];
  };
}

export const exam_sessions = db.collection<ExamSession>("exam_sessions");
