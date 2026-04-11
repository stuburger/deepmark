import type { HonoEnv } from "@/types"
import { OpenAPIHono } from "@hono/zod-openapi"
import * as create from "./create/route"
// import * as get from "./get/route";

export const routes = new OpenAPIHono<HonoEnv>().openapi(
	create.route,
	create.handler,
)
// .openapi(get.route, get.handler)
