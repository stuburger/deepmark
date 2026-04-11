import { handle, streamHandle } from "hono/aws-lambda"
import { routes } from "./api"

export const handler = process.env.SST_LIVE
	? handle(routes)
	: streamHandle(routes)
