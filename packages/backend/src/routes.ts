import { toFetchResponse, toReqRes } from "fetch-to-node";
import { type Context, Hono } from "hono";
import { server } from "./mcp-server";
import { getStatelessTransport } from "./transport";

export const route = new Hono()
  .post("/", async (c) => {
    const { req, res } = toReqRes(c.req.raw);

    const transport = await getStatelessTransport({ server });

    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });

    await transport.handleRequest(req, res, await c.req.json());

    return toFetchResponse(res);
  })
  .get("/", handleSessionRequest)
  .delete("/", handleSessionRequest);

async function handleSessionRequest(c: Context) {
  const { req, res } = toReqRes(c.req.raw);

  const transport = await getStatelessTransport({ server });

  res.on("close", () => {
    console.log("Request closed");
    transport.close();
    server.close();
  });

  await transport.handleRequest(req, res);
}
