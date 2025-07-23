import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createQuestionHandler,
  CreateQuestionSchema,
  listQuestionsHandler,
  ListQuestionsSchema,
  getQuestionByIdHandler,
  GetQuestionByIdSchema,
  updateQuestionByIdHandler,
  UpdateQuestionByIdSchema,
  createMarkSchemeHandler,
  CreateMarkSchemeSchema,
  updateMarkSchemeHandler,
  UpdateMarkSchemeSchema,
  answerQuestionHandler,
  AnswerQuestionSchema,
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
  "list-questions",
  {
    title: "List GCSE Questions",
    description: "List all GCSE questions with optional subject filtering",
    inputSchema: ListQuestionsSchema,
  },
  listQuestionsHandler
);

server.registerTool(
  "get-question-by-id",
  {
    title: "Get Question by ID",
    description: "Get a specific GCSE question by its ID",
    inputSchema: GetQuestionByIdSchema,
  },
  getQuestionByIdHandler
);

server.registerTool(
  "update-question-by-id",
  {
    title: "Update Question by ID",
    description: "Update an existing GCSE question by its ID",
    inputSchema: UpdateQuestionByIdSchema,
  },
  updateQuestionByIdHandler
);

server.registerTool(
  "create-mark-scheme",
  {
    title: "Create Mark Scheme",
    description: "Create a new mark scheme for a GCSE question",
    inputSchema: CreateMarkSchemeSchema,
  },
  createMarkSchemeHandler
);

server.registerTool(
  "update-mark-scheme",
  {
    title: "Update Mark Scheme",
    description: "Update an existing mark scheme by its ID",
    inputSchema: UpdateMarkSchemeSchema,
  },
  updateMarkSchemeHandler
);

server.registerTool(
  "answer-question",
  {
    title: "Answer Question",
    description: "Submit a student answer to a GCSE question",
    inputSchema: AnswerQuestionSchema,
  },
  answerQuestionHandler
);
