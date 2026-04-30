import { Resource } from "sst"
import { describe, expect, it } from "vitest"

describe("GET /api/scans/[...path]", () => {
	it("does not expose raw scan keys", async () => {
		const url = `${Resource.Web.url}/api/scans/batches/smoke-test/pages/does-not-exist.jpg`

		const start = Date.now()
		const response = await fetch(url, { redirect: "manual" })
		const duration = Date.now() - start

		console.log(`[scans-proxy] GET ${url}`)
		console.log(
			`[scans-proxy] status=${response.status} duration=${duration}ms`,
		)

		expect(response.status).toBe(404)
	})
})
