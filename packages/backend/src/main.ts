import { routes } from "./api"
import { handle, streamHandle } from "hono/aws-lambda"

export const handler = process.env.SST_LIVE
	? handle(routes)
	: streamHandle(routes)
