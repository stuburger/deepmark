import { TestAndRefineMarkSchemeSchema } from "./schema"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { Resource } from "sst"
import { tool } from "@/tools/shared/tool-utils"
import type { TestAndRefineJobPayload } from "@/job"

const sqsClient = new SQSClient({
	region: process.env.AWS_REGION || "us-east-1",
})

export const handler = tool(
	TestAndRefineMarkSchemeSchema,
	async (args, extra) => {
		const {
			mark_scheme_id,
			test_answers,
			accuracy_threshold,
			max_refinement_cycles,
			auto_refine,
			preserve_total_marks,
		} = args

		console.log("[test-and-refine-mark-scheme] Handler invoked", {
			mark_scheme_id,
			test_count: test_answers.length,
			accuracy_threshold,
			max_refinement_cycles,
			auto_refine,
		})

		// Create the job payload
		const jobPayload: TestAndRefineJobPayload = {
			mark_scheme_id,
			test_answers,
			accuracy_threshold,
			max_refinement_cycles,
			auto_refine,
			preserve_total_marks,
		}

		// Send the job to the SQS queue
		const queueUrl = (
			Resource as unknown as { RefinementQueue: { url: string } }
		).RefinementQueue.url
		const command = new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(jobPayload),
			MessageAttributes: {
				JobType: {
					StringValue: "test-and-refine-mark-scheme",
					DataType: "String",
				},
				MarkSchemeId: {
					StringValue: mark_scheme_id,
					DataType: "String",
				},
			},
		})

		try {
			const result = await sqsClient.send(command)
			console.log("[test-and-refine-mark-scheme] Job queued successfully", {
				messageId: result.MessageId,
				mark_scheme_id,
			})

			return `🚀 **Test and Refinement Job Queued**

📋 **Mark Scheme**: ${mark_scheme_id}
🔢 **Test Cases**: ${test_answers.length}
🎯 **Accuracy Threshold**: ${accuracy_threshold}%
🔄 **Max Refinement Cycles**: ${max_refinement_cycles}
⚙️ **Auto-Refine**: ${auto_refine ? "Enabled" : "Disabled"}
🔒 **Preserve Total Marks**: ${preserve_total_marks ? "Yes" : "No"}

Your mark scheme testing and refinement job has been queued for background processing. The job will:

1. Test the current mark scheme against all provided test answers
2. Calculate accuracy metrics and identify issues
3. ${auto_refine ? "Automatically refine the mark scheme if accuracy is below threshold" : "Provide detailed test results only (auto-refine disabled)"}
4. Generate a comprehensive report with recommendations

The job has a 5-minute timeout and will process in the background. Results will be available in the system logs.

**Job ID**: ${result.MessageId}

⏳ *Processing will begin shortly...*`
		} catch (error) {
			console.error("[test-and-refine-mark-scheme] Failed to queue job", {
				error,
			})
			throw new Error(`Failed to queue refinement job: ${error}`)
		}
	},
)
