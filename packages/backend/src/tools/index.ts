export { handler as debugToolHandler } from "./core/debug-tool/tool"
export { DebugToolSchema } from "./core/debug-tool/schema"

export { handler as createQuestionHandler } from "./questions/create/tool"
export { CreateQuestionSchema } from "./questions/create/schema"

export { handler as listQuestionsHandler } from "./questions/list/tool"
export { ListQuestionsSchema } from "./questions/list/schema"

export { handler as getQuestionByIdHandler } from "./questions/get/tool"
export { GetQuestionByIdSchema } from "./questions/get/schema"

export { handler as updateQuestionByIdHandler } from "./questions/update/tool"
export { UpdateQuestionByIdSchema } from "./questions/update/schema"

export { handler as createMarkSchemeHandler } from "./mark-schemes/create/tool"
export { CreateMarkSchemeSchema } from "./mark-schemes/create/schema"

export { handler as updateMarkSchemeHandler } from "./mark-schemes/update/tool"
export { UpdateMarkSchemeSchema } from "./mark-schemes/update/schema"

export { handler as createTestDatasetHandler } from "./mark-schemes/create-test-dataset/tool"
export { CreateTestDatasetSchema } from "./mark-schemes/create-test-dataset/schema"

export { handler as answerQuestionHandler } from "./answers/create/tool"
export { AnswerQuestionSchema } from "./answers/create/schema"

export { handler as evaluateAnswerHandler } from "./answers/evaluate/tool"
export { EvaluateAnswerSchema } from "./answers/evaluate/schema"

export { handler as markAnswerHandler } from "./mark-results/create/tool"
export { MarkAnswerSchema } from "./mark-results/create/schema"

export { handler as getMarkResultByAnswerIdHandler } from "./mark-results/get/tool"
export { GetMarkResultByAnswerIdSchema } from "./mark-results/get/schema"

export { handler as createExamPaperHandler } from "./exam-papers/create/tool"
export { CreateExamPaperSchema } from "./exam-papers/create/schema"

export { handler as listExamPapersHandler } from "./exam-papers/list/tool"
export { ListExamPapersSchema } from "./exam-papers/list/schema"

// Core Exam Paper Management
export { handler as getExamPaperByIdHandler } from "./exam-papers/get/tool"
export { GetExamPaperByIdSchema } from "./exam-papers/get/schema"

export { handler as updateExamPaperHandler } from "./exam-papers/update/tool"
export { UpdateExamPaperSchema } from "./exam-papers/update/schema"

export { handler as addQuestionToExamPaperHandler } from "./exam-papers/add-question/tool"
export { AddQuestionToExamPaperSchema } from "./exam-papers/add-question/schema"

export { handler as analyzeHandwritingHandler } from "./handwriting/analyze/tool"
export { AnalyzeHandwritingSchema } from "./handwriting/analyze/schema"

// // Phase 3: Session Management
// export { handler as startExamSessionHandler } from "./sessions/start-exam-session/tool";
// export { StartExamSessionSchema } from "./sessions/start-exam-session/schema";

// export { handler as completeExamSessionHandler } from "./sessions/complete-exam-session/tool";
// export { CompleteExamSessionSchema } from "./sessions/complete-exam-session/schema";

// export { handler as getExamSessionByIdHandler } from "./sessions/get-exam-session-by-id/tool";
// export { GetExamSessionByIdSchema } from "./sessions/get-exam-session-by-id/schema";

// export { handler as listExamSessionsHandler } from "./sessions/list-exam-sessions/tool";
// export { ListExamSessionsSchema } from "./sessions/list-exam-sessions/schema";

// // Phase 4: Answer Management
// export { handler as listAnswersByExamSessionHandler } from "./sessions/list-answers-by-exam-session/tool";
// export { ListAnswersByExamSessionSchema } from "./sessions/list-answers-by-exam-session/schema";

// export { handler as getExamPaperProgressHandler } from "./exam-papers/get-exam-paper-progress/tool";
// export { GetExamPaperProgressSchema } from "./exam-papers/get-exam-paper-progress/schema";

// // Phase 5: Analytics
// export { handler as getExamPaperStatisticsHandler } from "./exam-papers/get-exam-paper-statistics/tool";
// export { GetExamPaperStatisticsSchema } from "./exam-papers/get-exam-paper-statistics/schema";

// export { handler as getStudentPerformanceByExamPaperHandler } from "./get-student-performance-by-exam-paper/tool";
// export { GetStudentPerformanceByExamPaperSchema } from "./get-student-performance-by-exam-paper/schema";

// export { handler as compareExamPapersHandler } from "./compare-exam-papers/tool";
// export { CompareExamPapersSchema } from "./compare-exam-papers/schema";
