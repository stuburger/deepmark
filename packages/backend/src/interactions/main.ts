import { Hono } from "hono";
import { handle, streamHandle } from "hono/aws-lambda";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export const routes = new Hono()
  .use("*", async (c, next) => {
    let body: unknown = undefined;
    try {
      // Try to parse as JSON
      body = await c.req.json();
    } catch (e) {
      try {
        // Try to parse as text if not JSON
        body = await c.req.text();
      } catch (e2) {
        body = undefined;
      }
    }
    console.log("[Request Body]", body);
    await next();
  })
  .use("*", cors())
  .use("*", logger())
  .use("*", compress())
  .use("*", async (c, next) => {
    await next();
    if (!c.res.headers.get("cache-control")) {
      c.header(
        "cache-control",
        "no-store, max-age=0, must-revalidate, no-cache"
      );
    }
  })
  .post("/", (c) => {
    console.log("HERE!!", c);

    return c.json({
      submitted: true,
    });
  });

export const handler = handle(routes);
