import { service } from "./service"
import { type RouteHandler, createRoute, z } from "@hono/zod-openapi"
import { CreateQuestionSchema } from "./schema"

const RequestSchema = z.object(CreateQuestionSchema)

export const route = createRoute({
	method: "post",
	path: "/questions",
	request: {
		body: {
			content: {
				"application/json": {
					schema: RequestSchema,
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
						data: z.string(),
					}),
				},
			},
		},
	},
})

export const handler: RouteHandler<typeof route> = async (c) => {
	// TODO: Replace with real user extraction
	const userId = "demo-user"
	const args = c.req.valid("json")
	const result = await service(args, userId)
	return c.json({ data: result })
}
