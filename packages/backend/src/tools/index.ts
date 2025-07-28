export { handler as createQuestionHandler } from "./create-question/tool";
export { CreateQuestionSchema } from "./create-question/schema";

export { handler as listQuestionsHandler } from "./list-questions/tool";
export { ListQuestionsSchema } from "./list-questions/schema";

export { handler as getQuestionByIdHandler } from "./get-question-by-id/tool";
export { GetQuestionByIdSchema } from "./get-question-by-id/schema";

export { handler as updateQuestionByIdHandler } from "./update-question-by-id/tool";
export { UpdateQuestionByIdSchema } from "./update-question-by-id/schema";

export { handler as createMarkSchemeHandler } from "./create-mark-scheme/tool";
export { CreateMarkSchemeSchema } from "./create-mark-scheme/schema";

export { handler as updateMarkSchemeHandler } from "./update-mark-scheme/tool";
export { UpdateMarkSchemeSchema } from "./update-mark-scheme/schema";

export { handler as answerQuestionHandler } from "./answer-question/tool";
export { AnswerQuestionSchema } from "./answer-question/schema";

export { handler as markAnswerHandler } from "./mark-answer/tool";
export { MarkAnswerSchema } from "./mark-answer/schema";

export { handler as getMarkResultByIdHandler } from "./get-mark-result-by-id/tool";
export { GetMarkResultByIdSchema } from "./get-mark-result-by-id/schema";

export { handler as createExamPaperHandler } from "./create-exam-paper/tool";
export { CreateExamPaperSchema } from "./create-exam-paper/schema";

export { handler as listExamPapersHandler } from "./list-exam-papers/tool";
export { ListExamPapersSchema } from "./list-exam-papers/schema";

// Phase 1: Core Exam Paper Management
export { handler as getExamPaperByIdHandler } from "./get-exam-paper-by-id/tool";
export { GetExamPaperByIdSchema } from "./get-exam-paper-by-id/schema";

export { handler as updateExamPaperHandler } from "./update-exam-paper/tool";
export { UpdateExamPaperSchema } from "./update-exam-paper/schema";

// Phase 2: Question Management
export { handler as listQuestionsByExamPaperHandler } from "./list-questions-by-exam-paper/tool";
export { ListQuestionsByExamPaperSchema } from "./list-questions-by-exam-paper/schema";

export { handler as reorderQuestionsInExamPaperHandler } from "./reorder-questions-in-exam-paper/tool";
export { ReorderQuestionsInExamPaperSchema } from "./reorder-questions-in-exam-paper/schema";

// Phase 3: Session Management
export { handler as startExamSessionHandler } from "./start-exam-session/tool";
export { StartExamSessionSchema } from "./start-exam-session/schema";

export { handler as completeExamSessionHandler } from "./complete-exam-session/tool";
export { CompleteExamSessionSchema } from "./complete-exam-session/schema";

export { handler as getExamSessionByIdHandler } from "./get-exam-session-by-id/tool";
export { GetExamSessionByIdSchema } from "./get-exam-session-by-id/schema";

export { handler as listExamSessionsHandler } from "./list-exam-sessions/tool";
export { ListExamSessionsSchema } from "./list-exam-sessions/schema";

// Phase 4: Answer Management
export { handler as listAnswersByExamSessionHandler } from "./list-answers-by-exam-session/tool";
export { ListAnswersByExamSessionSchema } from "./list-answers-by-exam-session/schema";

export { handler as getExamPaperProgressHandler } from "./get-exam-paper-progress/tool";
export { GetExamPaperProgressSchema } from "./get-exam-paper-progress/schema";

// Phase 5: Analytics
export { handler as getExamPaperStatisticsHandler } from "./get-exam-paper-statistics/tool";
export { GetExamPaperStatisticsSchema } from "./get-exam-paper-statistics/schema";

export { handler as getStudentPerformanceByExamPaperHandler } from "./get-student-performance-by-exam-paper/tool";
export { GetStudentPerformanceByExamPaperSchema } from "./get-student-performance-by-exam-paper/schema";

export { handler as compareExamPapersHandler } from "./compare-exam-papers/tool";
export { CompareExamPapersSchema } from "./compare-exam-papers/schema";
