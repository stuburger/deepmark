import { MarkAnswerSchema } from "./schema";
import { answers, Answer } from "../../db/collections/answers";
import { questions, Question } from "../../db/collections/questions";
import { mark_schemes, MarkScheme } from "../../db/collections/mark-schemes";
import {
  marking_results,
  MarkingResult,
  MarkPointResult,
} from "../../db/collections/marking-results";
import { ObjectId } from "mongodb";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import z from "zod";
import { Resource } from "sst";
import { tool, text } from "../tool-utils";

const openai = createOpenAI({
  apiKey: Resource.OpenAiApiKey.value,
});

export const handler = tool(MarkAnswerSchema, async (args) => {
  const { answer_id, include_mark_result } = args;

  console.log("[mark-answer] Handler invoked", { answer_id });

  // Get the answer
  const answer = await answers.findOne({ _id: new ObjectId(answer_id) });
  console.log("[mark-answer] Fetched answer", { answer });

  if (!answer) {
    console.log(`[mark-answer] Answer not found: ${answer_id}`);
    return text(`Answer with ID ${answer_id} not found.`);
  }

  // Check if already marked
  if (answer.marking_status === "completed") {
    console.log(`[mark-answer] Answer already marked: ${answer_id}`);
    return text(`Answer ${answer_id} has already been marked.`);
  }

  // Get the question
  const question = await questions.findOne({
    _id: new ObjectId(answer.question_id),
  });
  console.log("[mark-answer] Fetched question", {
    question_id: answer.question_id,
    question,
  });

  if (!question) {
    console.log(`[mark-answer] Question not found for answer: ${answer_id}`);
    return text(`Question for answer ${answer_id} not found.`);
  }

  // Get the latest mark scheme created
  const markScheme = await mark_schemes.findOne(
    { question_id: answer.question_id },
    { sort: { created_at: -1 } }
  );

  console.log("[mark-answer] Fetched mark scheme", {
    question_id: answer.question_id,
    markScheme,
  });

  if (!markScheme) {
    console.log(
      `[mark-answer] Mark scheme not found for question: ${answer.question_id}`
    );
    return text(`Mark scheme for question ${answer.question_id} not found.`);
  }

  // Call external LLM for marking
  console.log("[mark-answer] Calling LLM for marking", {
    question_id: question._id,
    answer_id,
  });
  const markingResult = await callLLMForMarking(question, markScheme, answer);
  console.log("[mark-answer] LLM marking result", { markingResult });

  // Create marking result document
  const markingResultData: MarkingResult = {
    _id: new ObjectId(),
    answer_id,
    mark_points_results: markingResult.mark_points_results,
    total_score: markingResult.total_score,
    max_possible_score: answer.max_possible_score,
    marked_at: new Date(),
    llm_reasoning: markingResult.llm_reasoning,
    feedback_summary: markingResult.feedback_summary,
  };
  console.log("[mark-answer] Inserting marking result", {
    markingResultData,
  });

  // Insert marking result
  await marking_results.insertOne(markingResultData);

  // Update answer with marking status and score
  await answers.updateOne(
    { _id: new ObjectId(answer_id) },
    {
      $set: {
        marking_status: "completed",
        total_score: markingResult.total_score,
        marked_at: new Date(),
      },
    }
  );
  console.log("[mark-answer] Updated answer marking status to completed", {
    answer_id,
    total_score: markingResult.total_score,
  });

  // Prepare response content
  let responseText = `Answer marked successfully! Score: ${markingResult.total_score}/${answer.max_possible_score}`;

  // Include marking result if requested
  if (include_mark_result) {
    responseText += `\n\nMarking Result:\n${JSON.stringify(
      markingResultData,
      null,
      2
    )}`;
  }

  return text(responseText);
});

// Define the schema for the marking result
const markingResultSchema = z.object({
  mark_points_results: z.array(
    z.object({
      point_number: z.number(),
      awarded: z.boolean(),
      reasoning: z
        .string()
        .describe(
          "Detailed reasoning for why this mark was or was not awarded"
        ),
      expected_criteria: z
        .string()
        .describe("What the mark scheme expected for this point"),
      student_covered: z
        .string()
        .describe("What the student actually covered in their answer"),
    })
  ),
  total_score: z.number(),
  llm_reasoning: z
    .string()
    .describe("Chain-of-thought reasoning for the overall marking process"),
  feedback_summary: z
    .string()
    .describe("Overall feedback summary for the student"),
});

// Create example object that conforms to the schema
const exampleMarkingResult = {
  mark_points_results: [
    {
      point_number: 1,
      awarded: true,
      reasoning:
        "Student clearly describes the fermentation setup: 'Mix the yeast with sugar water'. This meets the criteria for describing the method/procedure.",
      expected_criteria:
        "Mentions adding the sample to glucose/sugar solution OR mentions mixing yeast sample with sugar water OR describes setting up fermentation test",
      student_covered: "Mix the yeast with sugar water",
    },
    {
      point_number: 2,
      awarded: true,
      reasoning:
        "Student mentions temperature requirement: 'leave in a warm place'. This satisfies the conditions needed for yeast fermentation.",
      expected_criteria:
        "States warm temperature needed (e.g., 37°C, warm water bath, room temperature) OR mentions anaerobic conditions (no oxygen/air excluded) OR mentions suitable pH conditions",
      student_covered: "leave in a warm place",
    },
    {
      point_number: 3,
      awarded: true,
      reasoning:
        "Student identifies gas production as key observation: 'Bubbles will form'. This clearly describes the expected result of fermentation.",
      expected_criteria:
        "Bubbles/gas produced OR carbon dioxide given off OR effervescence/fizzing observed OR froth/foam formation",
      student_covered: "Bubbles will form",
    },
    {
      point_number: 4,
      awarded: true,
      reasoning:
        "Student describes CO₂ test with correct result: 'test them with limewater which goes cloudy'. This is the standard confirmation test for carbon dioxide.",
      expected_criteria:
        "Test gas with limewater (turns milky/cloudy) OR use pH indicator (solution becomes more acidic) OR smell of alcohol/ethanol detected OR use gas collection tube to capture CO₂",
      student_covered: "test them with limewater which goes cloudy",
    },
  ],
  total_score: 4,
  llm_reasoning:
    "Systematic analysis: Point 1 - Student clearly describes fermentation setup with 'Mix the yeast with sugar water'. Point 2 - Temperature requirement met with 'leave in a warm place'. Point 3 - Gas production identified with 'Bubbles will form'. Point 4 - CO₂ test correctly described with limewater test. All criteria met for full marks.",
  feedback_summary:
    "Excellent answer scoring 4/4 marks. Student demonstrates comprehensive understanding of yeast testing procedure, including method, conditions, observations, and confirmation test.",
};

async function callLLMForMarking(
  question: Question,
  markScheme: MarkScheme,
  answer: Answer
): Promise<{
  mark_points_results: MarkPointResult[];
  total_score: number;
  llm_reasoning: string;
  feedback_summary: string;
}> {
  // Create the prompt for the LLM
  const prompt = `You are an expert GCSE examiner. Please mark the following student answer against the provided mark scheme.

<Question>
Question: ${question.question_text}
Topic: ${question.topic}
</Question>

<MarkScheme>

Total Marks: ${markScheme.points_total}

Mark Points:
${markScheme.mark_points
  .map(
    (point) =>
      `${point.point_number}. ${point.description} (${point.points} mark${
        point.points > 1 ? "s" : ""
      })

   ${point.criteria}`
  )
  .join("\n\n")}
</MarkScheme>

<StudentAnswer>
${answer.student_answer}
</StudentAnswer>

<MarkingRules>
CRITICAL RULES:
- Total marks awarded MUST NOT exceed ${markScheme.points_total}
- Each mark point can only award 0 or 1 mark (no partial marks)
- If unsure between 0 or 1 mark, award 0 (conservative marking)
- Marks must sum exactly to your awarded total

PENALTY SYSTEM:
- If you can't find clear evidence in text: award 0 marks
- When in doubt, under-mark rather than over-mark
</MarkingRules>

<Instructions>
Please analyze the student's answer systematically using chain-of-thought reasoning. For each mark point:

1. Think through the criteria step-by-step
2. Quote the specific part of the student's answer that relates to this mark point
3. Analyze whether the student's response meets the expected criteria
4. Provide detailed reasoning for your decision
5. Award 0 or 1 mark based on clear evidence

Your chain-of-thought reasoning should be systematic and thorough, as shown in the example. Think through each mark point carefully before making your decision.

<ExampleOutputFormat>
${JSON.stringify(exampleMarkingResult, null, 2)}
</ExampleOutputFormat>

Provide your response in the exact JSON format shown above.
</Instructions>`;

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: markingResultSchema,
    prompt,
    temperature: 0.1, // Low temperature for consistent marking
  });

  if (
    object.total_score !==
    object.mark_points_results.reduce((sum, mp) => sum + +mp.awarded, 0)
  ) {
    throw new Error(`Total score does not match sum of awarded marks. 
      This indicates an inconsistency in the LLM output.`);
  }

  return object;
}
