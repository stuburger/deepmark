import { Resource } from "sst"
import { describe, expect, it } from "vitest"

/**
 * Smoke test for /api/scans/[...path]. Hits the deployed web URL from
 * `Resource.Web.url` (localhost:3000 in `sst dev`, the real domain in
 * deployed stages). Without a session cookie the route MUST return 401 —
 * proving the route is live, reachable, and the auth guard fires before
 * any S3 work happens.
 */
describe("GET /api/scans/[...path]", () => {
	it("enforces auth at Resource.Web.url", async () => {
		const url = `${Resource.Web.url}/api/scans/batches/smoke-test/pages/does-not-exist.jpg`

		const start = Date.now()
		const response = await fetch(url, { redirect: "manual" })
		const duration = Date.now() - start

		console.log(`[scans-proxy] GET ${url}`)
		console.log(
			`[scans-proxy] status=${response.status} duration=${duration}ms`,
		)

		expect(response.status).toBe(401)
	})
})
