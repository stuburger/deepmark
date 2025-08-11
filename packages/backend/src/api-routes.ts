import { OpenAPIHono } from "@hono/zod-openapi"
import { routes as questions } from "./tools/questions"
import type { HonoEnv } from "./types"

export const apiRoutes = new OpenAPIHono<HonoEnv>().route(
	"/questions",
	questions,
)
