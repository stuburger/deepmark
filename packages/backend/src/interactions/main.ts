import type { HonoEnv } from "@/types"
import { OpenAPIHono } from "@hono/zod-openapi"
import { handle } from "hono/aws-lambda"
import { compress } from "hono/compress"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

export const routes = new OpenAPIHono<HonoEnv>()
	.use("*", cors())
	.use("*", logger())
	.use("*", compress())
	.use("*", async (c, next) => {
		await next()
		if (!c.res.headers.get("cache-control")) {
			c.header(
				"cache-control",
				"no-store, max-age=0, must-revalidate, no-cache",
			)
		}
	})
	.post("/", (c) => {
		console.log("HERE!!", c)

		return c.json({
			submitted: true,
		})
	})

export const handler = handle(routes)
