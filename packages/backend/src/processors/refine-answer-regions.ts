import { logger } from "@/lib/logger"

const TAG = "refine-answer-regions"

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

// Stub — full implementation in Phase 4
export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	for (const record of event.Records) {
		logger.info(TAG, "Message received (stub — not yet implemented)", {
			messageId: record.messageId,
		})
	}
	return {}
}
