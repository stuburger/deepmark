export { handler as debugToolHandler } from "./core/debug-tool/tool"
export { DebugToolSchema } from "./core/debug-tool/schema"

export { handler as createQuestionHandler } from "./questions/create-question/tool"
export { CreateQuestionSchema } from "./questions/create-question/schema"

export { handler as listQuestionsHandler } from "./questions/list-questions/tool"
export { ListQuestionsSchema } from "./questions/list-questions/schema"

export { handler as getQuestionByIdHandler } from "./questions/get-question-by-id/tool"
export { GetQuestionByIdSchema } from "./questions/get-question-by-id/schema"

export { handler as updateQuestionByIdHandler } from "./questions/update-question-by-id/tool"
export { UpdateQuestionByIdSchema } from "./questions/update-question-by-id/schema"

export { handler as createMarkSchemeHandler } from "./marking/create-mark-scheme/tool"
export { CreateMarkSchemeSchema } from "./marking/create-mark-scheme/schema"

export { handler as updateMarkSchemeHandler } from "./marking/update-mark-scheme/tool"
export { UpdateMarkSchemeSchema } from "./marking/update-mark-scheme/schema"

export { handler as answerQuestionHandler } from "./marking/answer-question/tool"
export { AnswerQuestionSchema } from "./marking/answer-question/schema"

export { handler as markAnswerHandler } from "./marking/mark-answer/tool"
export { MarkAnswerSchema } from "./marking/mark-answer/schema"

export { handler as getMarkResultByAnswerIdHandler } from "./marking/get-mark-result-by-answer-id/tool"
export { GetMarkResultByAnswerIdSchema } from "./marking/get-mark-result-by-answer-id/schema"

export { handler as createExamPaperHandler } from "./exam-papers/create-exam-paper/tool"
export { CreateExamPaperSchema } from "./exam-papers/create-exam-paper/schema"

export { handler as listExamPapersHandler } from "./exam-papers/list-exam-papers/tool"
export { ListExamPapersSchema } from "./exam-papers/list-exam-papers/schema"

// Core Exam Paper Management
export { handler as getExamPaperByIdHandler } from "./exam-papers/get-exam-paper-by-id/tool"
export { GetExamPaperByIdSchema } from "./exam-papers/get-exam-paper-by-id/schema"

export { handler as updateExamPaperHandler } from "./exam-papers/update-exam-paper/tool"
export { UpdateExamPaperSchema } from "./exam-papers/update-exam-paper/schema"

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
