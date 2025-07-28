import { ListExamPapersSchema } from "./schema";
import { exam_papers } from "../../db/collections/exam-papers";
import { text, tool } from "../tool-utils";

export const handler = tool(ListExamPapersSchema, async (args, extra) => {
  console.log("[list-exam-papers] Handler invoked");

  try {
    // Fetch all exam papers from the database
    const allExamPapers = await exam_papers.find({}).toArray();

    console.log("[list-exam-papers] Successfully retrieved exam papers", {
      count: allExamPapers.length,
    });

    // Format the response
    const formattedPapers = allExamPapers.map((paper) => ({
      id: paper._id.toString(),
      title: paper.title,
      subject: paper.subject,
      exam_board: paper.exam_board,
      year: paper.year,
      paper_number: paper.paper_number,
      total_marks: paper.total_marks,
      duration_minutes: paper.duration_minutes,
      created_by: paper.created_by,
      created_at: paper.created_at.toISOString(),
      updated_at: paper.updated_at.toISOString(),
      is_active: paper.is_active,
      sections_count: paper.sections.length,
      metadata: paper.metadata,
    }));

    return text(`Found ${allExamPapers.length} exam paper(s)`, {
      exam_papers: formattedPapers,
      total_count: allExamPapers.length,
    });
  } catch (error) {
    console.error("[list-exam-papers] Error retrieving exam papers:", error);
    throw new Error("Failed to retrieve exam papers from database");
  }
});
