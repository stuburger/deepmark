import { Hono } from "hono";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { ErrorCodes, VisibleError } from "./error";

import { route } from "./routes";
import { Resource } from "sst";
import { z } from "zod";
import { cors } from "hono/cors";
import { createClient } from "@openauthjs/openauth/client";
import { subjects } from "./subjects";

const client = createClient({
  clientID: `${Resource.App.name}_${Resource.App.stage}`,
  issuer: Resource.Auth.url,
});

const clientRegistrations = new Map();

const OAuthRegistrationSchema = z.object({
  redirect_uris: z.array(z.string().url()).optional(),
  client_name: z.string().optional(),
  client_uri: z.string().url().optional(),
  logo_uri: z.string().url().optional(),
  scope: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

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
  .use("/mcp/*", async (c, next) => {
    const authHeader = c.req.header("authorization");

    console.log("authHeader", authHeader);
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      c.header(
        "WWW-Authenticate",
        `Bearer realm="MCP Server", resource_metadata_uri="${Resource.Auth.url}/.well-known/oauth-protected-resource"`
      );
      return c.text("Unauthorized", 401);
    }

    const ret = await client.verify(subjects, token);

    console.log("verified", ret);

    await next();
  })
  .route("/mcp", route)
  .onError((error, c) => {
    if (error instanceof VisibleError) {
      // @ts-expect-error
      return c.json(error.toResponse(), error.statusCode());
    }

    if (error instanceof HTTPException) {
      console.error("http error:", error);
      return c.json(
        {
          type: "validation",
          code: ErrorCodes.Validation.INVALID_PARAMETER,
          message: "Invalid request",
        },
        400
      );
    }

    console.error("unhandled error:", error);
    return c.json(
      {
        type: "internal",
        code: ErrorCodes.Server.INTERNAL_ERROR,
        message: "Internal server error",
      },
      500
    );
  })
  .get("/.well-known/oauth-protected-resource", (c) => {
    // --- OAUTH DISCOVERY ENDPOINTS ---
    return c.json({
      issuer: Resource.Auth.url, // TODO: replace with actual URL or dynamic value
      authorization_server: Resource.Auth.url,
      token_endpoint: `${Resource.Auth.url}/auth/token`,
    });
  })
  .get("/.well-known/oauth-authorization-server", (c) => {
    return c.json({
      issuer: Resource.Auth.url,
      authorization_endpoint: `${Resource.Auth.url}/authorize`,
      token_endpoint: `${Resource.Auth.url}/token`,
      response_types_supported: ["code"],
      // response_types_supported: ["code", "token"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: ["none"], // or ["client_secret_post"] if you require client secrets
      registration_endpoint: `${Resource.Auth.url}/register`, // Using Auth URL like other endpoints
    });
  })
  .post("/register", async (c) => {
    try {
      console.log("Received client registration request");
      const body = await c.req.json();
      console.log("Registration request body:", body);

      // Validate the registration request according to RFC 7591

      const validatedData = OAuthRegistrationSchema.parse(body);
      console.log("Validated registration data:", validatedData);

      // Generate a unique client_id and client_secret
      const client_id = `client_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const client_secret = Math.random().toString(36).substr(2, 15);
      console.log("Generated client_id:", client_id);

      // Store the client registration (you might want to use a database here)
      const clientRegistration = {
        client_id,
        client_secret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // 0 means no expiration
        ...validatedData,
      };

      clientRegistrations.set(client_id, clientRegistration);

      console.log("Stored client registration for client_id:", client_id);

      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      console.log("Returning response with status 201");
      const response = c.json(clientRegistration, 201);
      console.log("Response created:", response);
    } catch (error) {
      console.error("Error processing registration request:", error);
      return c.json(
        {
          error: "invalid_request",
          error_description: "Invalid registration request",
        },
        400,
        {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      );
    }
  });

export type AppType = typeof routes;
