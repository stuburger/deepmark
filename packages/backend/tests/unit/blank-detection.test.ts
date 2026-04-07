import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
	DEFAULT_BLANK_THRESHOLD,
	computeInkDensity,
	isBlankPage,
} from "../../src/lib/scan-extraction/blank-detection"

async function makeJpeg(
	width: number,
	height: number,
	fill = 255,
): Promise<Buffer> {
	const raw = Buffer.alloc(width * height * 3, fill)
	return sharp(raw, { raw: { width, height, channels: 3 } })
		.jpeg({ quality: 95 })
		.toBuffer()
}

async function makeJpegWithDarkPixels(
	width: number,
	height: number,
	darkFraction: number,
): Promise<Buffer> {
	const raw = Buffer.alloc(width * height * 3, 255)
	const darkCount = Math.floor(width * height * darkFraction)
	for (let i = 0; i < darkCount * 3; i++) {
		raw[i] = 20
	}
	return sharp(raw, { raw: { width, height, channels: 3 } })
		.jpeg({ quality: 95 })
		.toBuffer()
}

describe("blank-detection", () => {
	it("flags a pure white JPEG as blank", async () => {
		const buffer = await makeJpeg(100, 100, 255)
		expect(await isBlankPage(buffer)).toBe(true)
	})

	it("does not flag a JPEG with 1% dark pixels as blank", async () => {
		const buffer = await makeJpegWithDarkPixels(100, 100, 0.01)
		expect(await isBlankPage(buffer)).toBe(false)
	})

	it("does not flag a greyscale form/header page with ~5% ink as blank", async () => {
		const buffer = await makeJpegWithDarkPixels(200, 200, 0.05)
		const density = await computeInkDensity(buffer)
		expect(density).toBeGreaterThan(DEFAULT_BLANK_THRESHOLD)
		expect(await isBlankPage(buffer)).toBe(false)
	})

	it("threshold is configurable", async () => {
		const buffer = await makeJpegWithDarkPixels(100, 100, 0.01)
		expect(await isBlankPage(buffer, DEFAULT_BLANK_THRESHOLD)).toBe(false)
		expect(await isBlankPage(buffer, 0.02)).toBe(true)
	})
})
