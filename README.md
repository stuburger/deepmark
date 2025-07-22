# MCP GCSE Tooling

This project defines a set of MCP (Model Context Protocol) tools for managing exam questions and mark schemes. Each tool is organized in its own folder and follows a consistent structure using Zod schemas for input validation.

## Tool List

The following MCP tools are defined:

- **create question**
- **update question by id**
- **create mark scheme**
- **update mark scheme**
- **get question by id**
- **list questions**

## Folder Structure

Each tool lives in its own folder. For example:

```
packages/backend/src/tools/
  create-question/
    schema.ts
    tool.ts
  update-question-by-id/
    schema.ts
    tool.ts
  create-mark-scheme/
    schema.ts
    tool.ts
  update-mark-scheme/
    schema.ts
    tool.ts
  get-question-by-id/
    schema.ts
    tool.ts
  list-questions/
    schema.ts
    tool.ts
```

## Database Schema

### Question

```ts
// Question type definition
 type Question = {
   question_text: string;
   topic: string;
   created_by: string;
   created_at: Date;
   updated_at: Date;
   subject:  "biology" |
       "chemistry" |
       "physics" |
       "english"
 }
```

### MarkScheme

```ts
// MarkPoint type definition
 type MarkPoint = {
   point_number: number;
   description: string;
   points: 1; // can only be 1
   criteria: string;
 }

// MarkScheme type definition
 type MarkScheme = {
   question_id: string;
   created_by: string;
   created_at: Date;
   updated_at: Date;
   points_total: number;
   mark_points: MarkPoint[];
 }
```

#### Example of `mark_points`

```json
{
  "mark_points": [
    {
      "pointNumber": 1,
      "description": "Temperature effect on enzyme activity",
      "points": 1,
      "criteria": "Award 1 mark for stating that enzyme activity increases with temperature up to optimum."
    },
    {
      "pointNumber": 2,
      "description": "Explanation of temperature effect mechanism",
      "points": 1,
      "criteria": "Award 1 mark for explaining that increased activity is due to increased kinetic energy and more successful collisions."
    },
    {
      "pointNumber": 3,
      "description": "High temperature denaturation",
      "points": 1,
      "criteria": "Award 1 mark for stating that enzymes become denatured at high temperatures."
    },
    {
      "pointNumber": 4,
      "description": "Explanation of denaturation mechanism",
      "points": 1,
      "criteria": "Award 1 mark for explaining that denaturation is due to breaking of hydrogen bonds and loss of 3D structure."
    }
  ]
}
```

> **Note:** The length of the `mark_points` array must equal the value of `points_total`.

## Schema Definition

Each tool folder contains a `schema.ts` file that defines the Zod schema for the tool. Example:

```ts
// schema.ts
import { z } from "zod";

export const CreateQuestionSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe("The topic or subject matter for the question"),
  question_text: z.string().describe("The exam question"),
  points: z
    .number()
    .int()
    .positive()
    .describe("Number of marks the question is worth"),
  difficulty_level: z
    .enum(["easy", "medium", "hard", "expert"])
    .describe("Difficulty level of the question"),
  subject: z
    .enum([
      "biology",
      "chemistry",
      "physics",
      "english",
    ])
    .describe("Subject area for the question"),
});
```

## Tool Handler Example

Each tool also has a `tool.ts` file that implements the handler. Example:

```ts
// tool.ts
import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateQuestionSchema } from "./schema";

export const handler: ToolCallback<typeof CreateQuestionSchema> = async (
  args
) => {
  const {
    topic,
    points,
    subject,
    // ...other fields
  } = args;

  try {
    // Implement tool logic here
    return {
      content: [
        {
          type: "text",
          text: `Question created successfully!`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to generate question: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
```

---

Update this README as you add or modify tools to keep documentation up to date.
