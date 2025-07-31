import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createQuestionHandler,
  CreateQuestionSchema,
  debugToolHandler,
  DebugToolSchema,
  // createQuestionPartHandler,
  // CreateQuestionPartSchema,
  // listQuestionsHandler,
  // ListQuestionsSchema,
  // getQuestionByIdHandler,
  // GetQuestionByIdSchema,
  // updateQuestionByIdHandler,
  // UpdateQuestionByIdSchema,
  // createMarkSchemeHandler,
  // CreateMarkSchemeSchema,
  // updateMarkSchemeHandler,
  // UpdateMarkSchemeSchema,
  // answerQuestionHandler,
  // AnswerQuestionSchema,
  // markAnswerHandler,
  // MarkAnswerSchema,
  // getMarkResultByIdHandler,
  // GetMarkResultByIdSchema,
  // createExamPaperHandler,
  // CreateExamPaperSchema,
  // listExamPapersHandler,
  // ListExamPapersSchema,
  // // Phase 1: Core Exam Paper Management
  // getExamPaperByIdHandler,
  // GetExamPaperByIdSchema,
  // updateExamPaperHandler,
  // UpdateExamPaperSchema,
  // // Phase 2: Question Management
  // listQuestionsByExamPaperHandler,
  // ListQuestionsByExamPaperSchema,
  // reorderQuestionsInExamPaperHandler,
  // ReorderQuestionsInExamPaperSchema,
  // // Phase 3: Session Management
  // startExamSessionHandler,
  // StartExamSessionSchema,
  // completeExamSessionHandler,
  // CompleteExamSessionSchema,
  // getExamSessionByIdHandler,
  // GetExamSessionByIdSchema,
  // listExamSessionsHandler,
  // ListExamSessionsSchema,
  // // Phase 4: Answer Management
  // listAnswersByExamSessionHandler,
  // ListAnswersByExamSessionSchema,
  // getExamPaperProgressHandler,
  // GetExamPaperProgressSchema,
  // // Phase 5: Analytics
  // getExamPaperStatisticsHandler,
  // GetExamPaperStatisticsSchema,
  // getStudentPerformanceByExamPaperHandler,
  // GetStudentPerformanceByExamPaperSchema,
  // compareExamPapersHandler,
  // CompareExamPapersSchema,
} from "./tools";

export const server = new McpServer({
  name: "mcp-gcse",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

server.registerTool(
  "create-question",
  {
    title: "Create GCSE Question",
    description: "Create a new GCSE question",
    inputSchema: CreateQuestionSchema,
  },
  createQuestionHandler
);

server.registerTool(
  "debug-tool",
  {
    title: "Check the status of this MCP server",
    description: "Log out information about this server. Used for debugging.",
    inputSchema: DebugToolSchema,
  },
  debugToolHandler
);

// server.registerTool(
//   "create-question-part",
//   {
//     title: "Create GCSE Question Part",
//     description: "Create a new part for an existing GCSE question",
//     inputSchema: CreateQuestionPartSchema,
//   },
//   createQuestionPartHandler
// );

// server.registerTool(
//   "list-questions",
//   {
//     title: "List GCSE Questions",
//     description: "List all GCSE questions with optional subject filtering",
//     inputSchema: ListQuestionsSchema,
//   },
//   listQuestionsHandler
// );

// server.registerTool(
//   "get-question-by-id",
//   {
//     title: "Get Question by ID",
//     description: "Get a specific GCSE question by its ID",
//     inputSchema: GetQuestionByIdSchema,
//   },
//   getQuestionByIdHandler
// );

// server.registerTool(
//   "update-question-by-id",
//   {
//     title: "Update Question by ID",
//     description: "Update an existing GCSE question by its ID",
//     inputSchema: UpdateQuestionByIdSchema,
//   },
//   updateQuestionByIdHandler
// );

// server.registerTool(
//   "create-mark-scheme",
//   {
//     title: "Create Mark Scheme",
//     description: `Create a new mark scheme for a GCSE question

//     Example:
//     Mark Scheme: Test for Yeast (4 marks)
// Question: Describe how you would test to confirm the presence of yeast in a sample.
// Mark Points:
// 1. Method/Procedure (1 mark)

// Mentions adding the sample to glucose/sugar solution
// OR mentions mixing yeast sample with sugar water
// OR describes setting up fermentation test

// 2. Conditions Required (1 mark)

// States warm temperature needed (e.g., 37°C, warm water bath, room temperature)
// OR mentions anaerobic conditions (no oxygen/air excluded)
// OR mentions suitable pH conditions

// 3. Observation/Results (1 mark)

// Bubbles/gas produced
// OR carbon dioxide given off
// OR effervescence/fizzing observed
// OR froth/foam formation

// 4. Confirmation Test (1 mark)

// Test gas with limewater (turns milky/cloudy)
// OR use pH indicator (solution becomes more acidic)
// OR smell of alcohol/ethanol detected
// OR use gas collection tube to capture CO₂

// Additional Guidance:

// Accept equivalent terms (e.g., "sugar" for glucose)
// Do not accept vague terms like "reaction occurs" without specific observation
// Time references (e.g., "after 10 minutes") can support but don't earn marks alone
// Equipment mentions (test tubes, measuring cylinders) are supplementary but don't earn marks

// Sample Chain-of-Thought Marking:
// Student Response: "Mix the yeast with sugar water and leave in a warm place. Bubbles will form and you can test them with limewater which goes cloudy."
// MARK POINT 1: Method/Procedure (1 mark)

// Quote: "Mix the yeast with sugar water"
// Analysis: Student describes basic fermentation setup
// Criteria met: YES
// Award: 1 mark
// Running total: 1/4 marks

// MARK POINT 2: Conditions Required (1 mark)

// Quote: "leave in a warm place"
// Analysis: Student mentions temperature requirement
// Criteria met: YES
// Award: 1 mark
// Running total: 2/4 marks

// MARK POINT 3: Observation/Results (1 mark)

// Quote: "Bubbles will form"
// Analysis: Student identifies gas production as key observation
// Criteria met: YES
// Award: 1 mark
// Running total: 3/4 marks

// MARK POINT 4: Confirmation Test (1 mark)

// Quote: "test them with limewater which goes cloudy"
// Analysis: Student describes CO₂ test with correct result
// Criteria met: YES
// Award: 1 mark
// Running total: 4/4 marks

// FINAL TOTAL: 4/4 marks
// This mark scheme structure makes it easier for the LLM to work systematically through each component while maintaining clear criteria for each mark point.

// CRITICAL RULES:
// - Total marks awarded MUST NOT exceed {total_marks}
// - Each mark point can only award 0 or 1 mark (no partial marks)
// - If unsure between 0 or 1 mark, award 0 (conservative marking)
// - Marks must sum exactly to your awarded total

// PENALTY SYSTEM:
// - If you can't find clear evidence in text: award 0 marks
// - When in doubt, under-mark rather than over-mark
//     `,
//     inputSchema: CreateMarkSchemeSchema,
//   },
//   createMarkSchemeHandler
// );

// server.registerTool(
//   "update-mark-scheme",
//   {
//     title: "Update Mark Scheme",
//     description: "Update an existing mark scheme by its ID",
//     inputSchema: UpdateMarkSchemeSchema,
//   },
//   updateMarkSchemeHandler
// );

// server.registerTool(
//   "answer-question",
//   {
//     title: "Answer Question",
//     description: "Submit a student answer to a GCSE question",
//     inputSchema: AnswerQuestionSchema,
//   },
//   answerQuestionHandler
// );

// server.registerTool(
//   "mark-answer",
//   {
//     title: "Mark Answer",
//     description:
//       "Automatically mark a student answer against the mark scheme using LLM",
//     inputSchema: MarkAnswerSchema,
//   },
//   markAnswerHandler
// );

// server.registerTool(
//   "get-mark-result-by-id",
//   {
//     title: "Get Mark Result by Answer ID",
//     description: "Retrieve the marking result for a specific answer by its ID",
//     inputSchema: GetMarkResultByIdSchema,
//   },
//   getMarkResultByIdHandler
// );

// server.registerTool(
//   "create-exam-paper",
//   {
//     title: "Create Exam Paper",
//     description:
//       "Create a new exam paper with sections containing ordered questions",
//     inputSchema: CreateExamPaperSchema,
//   },
//   createExamPaperHandler
// );

// server.registerTool(
//   "list-exam-papers",
//   {
//     title: "List Exam Papers",
//     description: "List all exam papers with optional filtering",
//     inputSchema: ListExamPapersSchema,
//   },
//   listExamPapersHandler
// );

// // Phase 1: Core Exam Paper Management
// server.registerTool(
//   "get-exam-paper-by-id",
//   {
//     title: "Get Exam Paper by ID",
//     description:
//       "Retrieve a specific exam paper by its ID with question details",
//     inputSchema: GetExamPaperByIdSchema,
//   },
//   getExamPaperByIdHandler
// );

// server.registerTool(
//   "update-exam-paper",
//   {
//     title: "Update Exam Paper",
//     description: "Update an existing exam paper by its ID",
//     inputSchema: UpdateExamPaperSchema,
//   },
//   updateExamPaperHandler
// );

// // Phase 2: Question Management
// server.registerTool(
//   "list-questions-by-exam-paper",
//   {
//     title: "List Questions by Exam Paper",
//     description:
//       "List all questions in a specific exam paper, organized by sections",
//     inputSchema: ListQuestionsByExamPaperSchema,
//   },
//   listQuestionsByExamPaperHandler
// );

// server.registerTool(
//   "reorder-questions-in-exam-paper",
//   {
//     title: "Reorder Questions in Exam Paper",
//     description: "Reorder questions within a specific section of an exam paper",
//     inputSchema: ReorderQuestionsInExamPaperSchema,
//   },
//   reorderQuestionsInExamPaperHandler
// );

// // Phase 3: Session Management
// server.registerTool(
//   "start-exam-session",
//   {
//     title: "Start Exam Session",
//     description:
//       "Start a new exam session for a student taking a specific exam paper",
//     inputSchema: StartExamSessionSchema,
//   },
//   startExamSessionHandler
// );

// server.registerTool(
//   "complete-exam-session",
//   {
//     title: "Complete Exam Session",
//     description: "Complete an exam session with final score and status",
//     inputSchema: CompleteExamSessionSchema,
//   },
//   completeExamSessionHandler
// );

// server.registerTool(
//   "get-exam-session-by-id",
//   {
//     title: "Get Exam Session by ID",
//     description:
//       "Retrieve a specific exam session by its ID with calculated metrics",
//     inputSchema: GetExamSessionByIdSchema,
//   },
//   getExamSessionByIdHandler
// );

// server.registerTool(
//   "list-exam-sessions",
//   {
//     title: "List Exam Sessions",
//     description: "List exam sessions with optional filtering and pagination",
//     inputSchema: ListExamSessionsSchema,
//   },
//   listExamSessionsHandler
// );

// // Phase 4: Answer Management
// server.registerTool(
//   "list-answers-by-exam-session",
//   {
//     title: "List Answers by Exam Session",
//     description: "List all answers submitted in a specific exam session",
//     inputSchema: ListAnswersByExamSessionSchema,
//   },
//   listAnswersByExamSessionHandler
// );

// server.registerTool(
//   "get-exam-paper-progress",
//   {
//     title: "Get Exam Paper Progress",
//     description:
//       "Get detailed progress information for a student on a specific exam paper",
//     inputSchema: GetExamPaperProgressSchema,
//   },
//   getExamPaperProgressHandler
// );

// // Phase 5: Analytics
// server.registerTool(
//   "get-exam-paper-statistics",
//   {
//     title: "Get Exam Paper Statistics",
//     description:
//       "Get comprehensive statistics and analytics for a specific exam paper",
//     inputSchema: GetExamPaperStatisticsSchema,
//   },
//   getExamPaperStatisticsHandler
// );

// server.registerTool(
//   "get-student-performance-by-exam-paper",
//   {
//     title: "Get Student Performance by Exam Paper",
//     description:
//       "Analyze a student's performance on a specific exam paper with detailed metrics",
//     inputSchema: GetStudentPerformanceByExamPaperSchema,
//   },
//   getStudentPerformanceByExamPaperHandler
// );

// server.registerTool(
//   "compare-exam-papers",
//   {
//     title: "Compare Exam Papers",
//     description:
//       "Compare multiple exam papers across various metrics and performance indicators",
//     inputSchema: CompareExamPapersSchema,
//   },
//   compareExamPapersHandler
// );
