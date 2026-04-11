import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
	AddQuestionToExamPaperSchema,
	AnalyzeHandwritingSchema,
	AnswerQuestionSchema,
	CreateExamPaperSchema,
	CreateMarkSchemeSchema,
	CreateQuestionSchema,
	CreateTestDatasetSchema,
	DebugToolSchema,
	EvaluateAnswerSchema,
	GetExamPaperByIdSchema,
	GetMarkResultByAnswerIdSchema,
	GetQuestionByIdSchema,
	ListExamPapersSchema,
	ListQuestionsSchema,
	MarkAnswerSchema,
	RetriggerPdfIngestionJobSchema,
	TestAndRefineMarkSchemeSchema,
	UpdateExamPaperSchema,
	UpdateMarkSchemeSchema,
	UpdateQuestionByIdSchema,
	addQuestionToExamPaperHandler,
	analyzeHandwritingHandler,
	answerQuestionHandler,
	createExamPaperHandler,
	createMarkSchemeHandler,
	createQuestionHandler,
	createTestDatasetHandler,
	debugToolHandler,
	evaluateAnswerHandler,
	// // Phase 1: Core Exam Paper Management
	getExamPaperByIdHandler,
	getMarkResultByAnswerIdHandler,
	getQuestionByIdHandler,
	listExamPapersHandler,
	listQuestionsHandler,
	markAnswerHandler,
	retriggerPdfIngestionJobHandler,
	testAndRefineMarkSchemeHandler,
	updateExamPaperHandler,
	updateMarkSchemeHandler,
	updateQuestionByIdHandler,
	// // Phase 2: Question Management
	// listQuestionsByExamPaperHandler,
	// ListQuestionsByExamPaperSchema,
	// reorderQuestionsInExamPaperHandler,
	// ReorderQuestionsInExamPaperSchema,
	// // Phase 4: Answer Management
	// getExamPaperProgressHandler,
	// GetExamPaperProgressSchema,
	// // Phase 5: Analytics
	// getExamPaperStatisticsHandler,
	// GetExamPaperStatisticsSchema,
	// getStudentPerformanceByExamPaperHandler,
	// GetStudentPerformanceByExamPaperSchema,
	// compareExamPapersHandler,
	// CompareExamPapersSchema,
} from "./tools"
import { CREATE_MARK_SCHEME_DESCRIPTION } from "./tools/mark-schemes/create-mark-scheme-description"

export const server = new McpServer({
	name: "mcp-gcse",
	version: "1.0.0",
})

server.registerTool(
	"create-question",
	{
		title: "Create GCSE Question",
		description: "Create a new GCSE question",
		inputSchema: CreateQuestionSchema,
	},
	createQuestionHandler,
)

server.registerTool(
	"debug-tool",
	{
		title: "Check the status of this MCP server",
		description: "Log out information about this server. Used for debugging.",
		inputSchema: DebugToolSchema,
	},
	debugToolHandler,
)

server.registerTool(
	"list-questions",
	{
		title: "List GCSE Questions",
		description: "List all GCSE questions with optional subject filtering",
		inputSchema: ListQuestionsSchema,
	},
	listQuestionsHandler,
)

server.registerTool(
	"get-question-by-id",
	{
		title: "Get Question by ID",
		description: "Get a specific GCSE question by its ID",
		inputSchema: GetQuestionByIdSchema,
	},
	getQuestionByIdHandler,
)

server.registerTool(
	"update-question-by-id",
	{
		title: "Update Question by ID",
		description: "Update an existing GCSE question by its ID",
		inputSchema: UpdateQuestionByIdSchema,
	},
	updateQuestionByIdHandler,
)

server.registerTool(
	"create-mark-scheme",
	{
		title: "Create Mark Scheme",
		description: CREATE_MARK_SCHEME_DESCRIPTION,
		inputSchema: CreateMarkSchemeSchema,
	},
	createMarkSchemeHandler,
)

server.registerTool(
	"update-mark-scheme",
	{
		title: "Update Mark Scheme",
		description: "Update an existing mark scheme by its ID",
		inputSchema: UpdateMarkSchemeSchema,
	},
	updateMarkSchemeHandler,
)

server.registerTool(
	"test-and-refine-mark-scheme",
	{
		title: "Test and Refine Mark Scheme",
		description:
			"Run the adversarial loop: student agent targets specific scores, grader marks answers. Persists MarkSchemeTestRun records and updates refined_at. Use for mark scheme calibration.",
		inputSchema: TestAndRefineMarkSchemeSchema,
	},
	testAndRefineMarkSchemeHandler,
)

server.registerTool(
	"create-test-dataset",
	{
		title: "Create Test Dataset",
		description:
			"Create a test dataset with example answers and expected scores for mark scheme testing and validation",
		inputSchema: CreateTestDatasetSchema,
	},
	createTestDatasetHandler,
)

server.registerTool(
	"answer-question",
	{
		title: "Answer Question",
		description: "Submit a student answer to a GCSE question",
		inputSchema: AnswerQuestionSchema,
	},
	answerQuestionHandler,
)

server.registerTool(
	"evaluate-answer",
	{
		title: "Evaluate Answer (Testing)",
		description:
			"Evaluate a student answer against a mark scheme without saving to database - useful for mark scheme testing and refinement",
		inputSchema: EvaluateAnswerSchema,
	},
	evaluateAnswerHandler,
)

server.registerTool(
	"mark-answer",
	{
		title: "Mark Answer",
		description:
			"Automatically mark a student answer against the mark scheme using LLM",
		inputSchema: MarkAnswerSchema,
	},
	markAnswerHandler,
)

server.registerTool(
	"get-mark-result-by-answer-id",
	{
		title: "Get Mark Result by Answer ID",
		description: "Retrieve the marking result for a specific answer by its ID",
		inputSchema: GetMarkResultByAnswerIdSchema,
	},
	getMarkResultByAnswerIdHandler,
)

server.registerTool(
	"create-exam-paper",
	{
		title: "Create Exam Paper",
		description:
			"Create a new exam paper with sections containing ordered questions",
		inputSchema: CreateExamPaperSchema,
	},
	createExamPaperHandler,
)

server.registerTool(
	"list-exam-papers",
	{
		title: "List Exam Papers",
		description: "List all exam papers with optional filtering",
		inputSchema: ListExamPapersSchema,
	},
	listExamPapersHandler,
)

// // Phase 1: Core Exam Paper Management
server.registerTool(
	"get-exam-paper-by-id",
	{
		title: "Get Exam Paper by ID",
		description:
			"Retrieve a specific exam paper by its ID with question details",
		inputSchema: GetExamPaperByIdSchema,
	},
	getExamPaperByIdHandler,
)

server.registerTool(
	"update-exam-paper",
	{
		title: "Update Exam Paper",
		description: "Update an existing exam paper by its ID",
		inputSchema: UpdateExamPaperSchema,
	},
	updateExamPaperHandler,
)

server.registerTool(
	"add-question-to-exam-paper",
	{
		title: "Add Question to Exam Paper",
		description:
			"Add an existing question to a specific exam paper and section",
		inputSchema: AddQuestionToExamPaperSchema,
	},
	addQuestionToExamPaperHandler,
)

server.registerTool(
	"analyze-handwriting",
	{
		title: "Analyse Handwriting",
		description:
			"Upload a JPEG image of handwritten text to receive a full transcript and bounding-box annotations highlighting words, lines, corrections, and other handwriting features using Gemini vision AI",
		inputSchema: AnalyzeHandwritingSchema,
	},
	analyzeHandwritingHandler,
)

server.registerTool(
	"retrigger-pdf-ingestion-job",
	{
		title: "Retrigger PDF Ingestion Job",
		description:
			"Re-queue a failed or completed PDF ingestion job for processing. Use to retry after failure or to re-run the pipeline.",
		inputSchema: RetriggerPdfIngestionJobSchema,
	},
	retriggerPdfIngestionJobHandler,
)

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
