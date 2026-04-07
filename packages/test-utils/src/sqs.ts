import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"

const sqs = new SQSClient({})

export const sendToQueue = (queueUrl: string, body: object) =>
	sqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(body),
		}),
	)
