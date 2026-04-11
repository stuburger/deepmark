import type { HonoEnv } from "@/types"
import { type RouteHandler, createRoute, z } from "@hono/zod-openapi"
import { CreateQuestionResponseSchema, CreateQuestionSchema } from "./schema"
import { service } from "./service"

export const route = createRoute({
	method: "post",
	path: "/questions",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object(CreateQuestionSchema),
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "Question created successfully",
			content: {
				"application/json": {
					schema: z.object({
						data: z.object(CreateQuestionResponseSchema),
					}),
				},
			},
		},
	},
})

export const handler: RouteHandler<typeof route, HonoEnv> = async (c) => {
	const { extra } = c.get("auth")
	const args = c.req.valid("json")
	const result = await service(args, extra)
	return c.json({ data: result })
}
