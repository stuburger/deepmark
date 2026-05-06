import {
	SESv2Client,
	SendEmailCommand,
	type SendEmailRequest,
} from "@aws-sdk/client-sesv2"
import type { RenderedEmail } from "@mcp-gcse/emails"
import { Resource } from "sst"

import { logger } from "@/lib/infra/logger"

const TAG = "email/send"

let cachedClient: SESv2Client | null = null

function getClient(): SESv2Client {
	if (!cachedClient) {
		cachedClient = new SESv2Client({})
	}
	return cachedClient
}

type SendArgs = {
	to: string
	rendered: RenderedEmail
}

/**
 * Send a rendered email via SESv2 using the per-stage `Email` SST resource.
 * The `Resource.Email.sender` is the verified sender domain SST set up in
 * `infra/email.ts`; the local-part is hard-coded to `hello` since DeepMark
 * has a single sender identity (per Stuart's confirmation).
 *
 * Errors throw — callers (the EmailSubscriber dispatcher) catch and let the
 * subscriber's DLQ + bounded-retry policy handle replay.
 */
export async function sendEmail({ to, rendered }: SendArgs): Promise<void> {
	const fromAddress = `DeepMark <hello@${Resource.Email.sender}>`

	const request: SendEmailRequest = {
		FromEmailAddress: fromAddress,
		ReplyToAddresses: ["hello@getdeepmark.com"],
		Destination: { ToAddresses: [to] },
		Content: {
			Simple: {
				Subject: { Data: rendered.subject, Charset: "UTF-8" },
				Body: {
					Html: { Data: rendered.html, Charset: "UTF-8" },
					Text: { Data: rendered.text, Charset: "UTF-8" },
				},
			},
		},
	}

	logger.info(TAG, "Sending email", { to, subject: rendered.subject })
	await getClient().send(new SendEmailCommand(request))
}
