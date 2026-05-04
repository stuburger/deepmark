import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda"

const lambda = new LambdaClient({})

export type LambdaInvokeResult = {
	statusCode: number
	functionError?: string
	payload: unknown
	logTail?: string
}

/**
 * Invoke a deployed Lambda synchronously with a synthetic SQS event payload —
 * used by smoke tests that exercise queue-subscriber handlers under real
 * Lambda conditions (memory cap, vCPU, native bindings) without going
 * through SQS. `receiveCount` lets the test exercise the
 * ApproximateReceiveCount short-circuit.
 */
export async function invokeLambdaWithSqsBody(
	functionName: string,
	body: object,
	options: { receiveCount?: number } = {},
): Promise<LambdaInvokeResult> {
	const event = {
		Records: [
			{
				messageId: `test-${Date.now()}`,
				receiptHandle: "test-receipt-handle",
				body: JSON.stringify(body),
				attributes: {
					ApproximateReceiveCount: String(options.receiveCount ?? 1),
				},
				messageAttributes: {},
				md5OfBody: "",
				eventSource: "aws:sqs",
				eventSourceARN: "test-arn",
				awsRegion: "eu-west-2",
			},
		],
	}

	const result = await lambda.send(
		new InvokeCommand({
			FunctionName: functionName,
			Payload: JSON.stringify(event),
			LogType: "Tail",
		}),
	)

	const responseText = result.Payload
		? new TextDecoder().decode(result.Payload)
		: ""
	const payload = responseText ? safeJsonParse(responseText) : null
	const logTail = result.LogResult
		? Buffer.from(result.LogResult, "base64").toString("utf-8")
		: undefined

	return {
		statusCode: result.StatusCode ?? 0,
		functionError: result.FunctionError,
		payload,
		logTail,
	}
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}
