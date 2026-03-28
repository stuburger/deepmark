#!/usr/bin/env bun
/**
 * Logo processor: removes white background and outputs favicons, navbar logo,
 * and a transparency-preserved version at original dimensions.
 *
 * Usage: bun scripts/process-logo.ts <input-image> [output-dir]
 * Example: bun scripts/process-logo.ts apps/web/public/deepmark-logo.png apps/web/public
 */

import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

// 16px is too small for letter-based logos — browsers fall back gracefully
const FAVICON_SIZES = [32, 48, 96, 180, 192, 512]

// Padding as a fraction of the favicon size (10% each side)
const FAVICON_PADDING_RATIO = 0.1

const NAVBAR_HEIGHT = 40

/**
 * Removes the outer background from an image using a flood-fill from the
 * edges. Only pixels reachable from the image border that are near-white are
 * made transparent — interior white pixels (e.g. white text on a coloured
 * shape) are left untouched.
 */
async function removeWhiteBackground(
	inputBuffer: Buffer,
	threshold = 240,
): Promise<Buffer> {
	const image = sharp(inputBuffer)
	const { width, height } = await image.metadata()

	if (!width || !height) throw new Error("Could not read image dimensions")

	const rawBuffer = await image
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: false })

	const data = new Uint8Array(rawBuffer)

	const isNearWhite = (offset: number) =>
		data[offset] >= threshold &&
		data[offset + 1] >= threshold &&
		data[offset + 2] >= threshold

	// BFS flood fill from all border pixels that are near-white
	const visited = new Uint8Array(width * height)
	const queue: number[] = []

	const enqueue = (x: number, y: number) => {
		const idx = y * width + x
		if (visited[idx]) return
		const offset = idx * 4
		if (!isNearWhite(offset)) return
		visited[idx] = 1
		queue.push(idx)
	}

	for (let x = 0; x < width; x++) {
		enqueue(x, 0)
		enqueue(x, height - 1)
	}
	for (let y = 0; y < height; y++) {
		enqueue(0, y)
		enqueue(width - 1, y)
	}

	while (queue.length > 0) {
		// biome-ignore lint/style/noNonNullAssertion: queue is non-empty
		const idx = queue.pop()!
		data[idx * 4 + 3] = 0 // make transparent

		const x = idx % width
		const y = Math.floor(idx / width)
		if (x > 0) enqueue(x - 1, y)
		if (x < width - 1) enqueue(x + 1, y)
		if (y > 0) enqueue(x, y - 1)
		if (y < height - 1) enqueue(x, y + 1)
	}

	return sharp(Buffer.from(data), {
		raw: { width, height, channels: 4 },
	})
		.png()
		.toBuffer()
}

/**
 * Crops an image to the bounding box of its coloured, opaque pixels.
 * Near-white pixels are excluded from the bounding box calculation — JPEG
 * compression artifacts in "empty" areas are near-white and would otherwise
 * push the box far beyond the actual logo content. White text/elements inside
 * the logo are still included in the final crop because they're surrounded by
 * coloured content.
 */
async function tightCrop(
	inputBuffer: Buffer,
	whiteThreshold = 220,
): Promise<Buffer> {
	const { data, info } = await sharp(inputBuffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	const { width, height } = info
	let minX = width
	let maxX = 0
	let minY = height
	let maxY = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const offset = (y * width + x) * 4
			const r = data[offset]
			const g = data[offset + 1]
			const b = data[offset + 2]
			const alpha = data[offset + 3]
			// Only anchor the bounding box on coloured, opaque pixels
			if (
				alpha > 10 &&
				!(r > whiteThreshold && g > whiteThreshold && b > whiteThreshold)
			) {
				if (x < minX) minX = x
				if (x > maxX) maxX = x
				if (y < minY) minY = y
				if (y > maxY) maxY = y
			}
		}
	}

	if (minX > maxX || minY > maxY) return inputBuffer

	return sharp(inputBuffer)
		.extract({
			left: minX,
			top: minY,
			width: maxX - minX + 1,
			height: maxY - minY + 1,
		})
		.png()
		.toBuffer()
}

/**
 * Finds the most common opaque, non-white pixel colour in an image.
 * Uses a coarse 32-level quantisation bucket per channel to group similar colours.
 */
async function detectDominantColor(
	inputBuffer: Buffer,
): Promise<{ r: number; g: number; b: number; alpha: number }> {
	const { width, height, data } = await sharp(inputBuffer)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
		.then(({ data, info }) => ({
			width: info.width,
			height: info.height,
			data,
		}))

	const buckets = new Map<
		string,
		{ r: number; g: number; b: number; count: number }
	>()

	for (let i = 0; i < width * height; i++) {
		const offset = i * 4
		const r = data[offset]
		const g = data[offset + 1]
		const b = data[offset + 2]
		const a = data[offset + 3]

		// Skip transparent and near-white pixels
		if (a < 128) continue
		if (r > 220 && g > 220 && b > 220) continue

		// Quantise to 32-level buckets to group similar shades
		const key = `${r >> 3},${g >> 3},${b >> 3}`
		const existing = buckets.get(key)
		if (existing) {
			existing.r += r
			existing.g += g
			existing.b += b
			existing.count++
		} else {
			buckets.set(key, { r, g, b, count: 1 })
		}
	}

	if (buckets.size === 0) {
		// Fallback: no clear non-white colour found, use a neutral dark
		return { r: 30, g: 30, b: 30, alpha: 1 }
	}

	let best = { r: 0, g: 0, b: 0, count: 0 }
	for (const bucket of buckets.values()) {
		if (bucket.count > best.count) best = bucket
	}

	return {
		r: Math.round(best.r / best.count),
		g: Math.round(best.g / best.count),
		b: Math.round(best.b / best.count),
		alpha: 1,
	}
}

async function main() {
	const args = process.argv.slice(2)
	if (args.length < 1) {
		console.error(
			"Usage: bun scripts/process-logo.ts <input-image> [output-dir]",
		)
		process.exit(1)
	}

	const inputPath = path.resolve(args[0])
	if (!fs.existsSync(inputPath)) {
		console.error(`Input file not found: ${inputPath}`)
		process.exit(1)
	}

	const inputDir = path.dirname(inputPath)
	const outputDir = args[1] ? path.resolve(args[1]) : inputDir

	fs.mkdirSync(outputDir, { recursive: true })

	const baseName = path.basename(inputPath, path.extname(inputPath))

	console.log(`Processing: ${inputPath}`)
	console.log(`Output dir: ${outputDir}\n`)

	const inputBuffer = fs.readFileSync(inputPath)
	const { width, height } = await sharp(inputBuffer).metadata()

	if (!width || !height) {
		console.error("Could not determine image dimensions")
		process.exit(1)
	}

	console.log(`Original dimensions: ${width}x${height}`)

	// Remove background once, reuse the result for all outputs
	const transparentBuffer = await removeWhiteBackground(inputBuffer)

	// 1. Original dimensions with transparent background
	const originalOutputPath = path.join(outputDir, `${baseName}-transparent.png`)
	fs.writeFileSync(originalOutputPath, transparentBuffer)
	console.log(
		`✓ Transparent (${width}x${height}): ${path.relative(process.cwd(), originalOutputPath)}`,
	)

	// 2. Navbar logo — scale to NAVBAR_HEIGHT preserving aspect ratio
	const navbarOutputPath = path.join(outputDir, `${baseName}-navbar.png`)
	const navbarBuffer = await sharp(transparentBuffer)
		.resize({ height: NAVBAR_HEIGHT })
		.png()
		.toBuffer()
	fs.writeFileSync(navbarOutputPath, navbarBuffer)
	const navMeta = await sharp(navbarBuffer).metadata()
	console.log(
		`✓ Navbar (${navMeta.width}x${navMeta.height}): ${path.relative(process.cwd(), navbarOutputPath)}`,
	)

	// 3. Favicons — solid background + tight crop so the icon fills the square
	const faviconDir = path.join(outputDir, "favicons")
	fs.mkdirSync(faviconDir, { recursive: true })

	// Pixel-accurate crop to the bounding box of non-transparent content
	const trimmedBuffer = await tightCrop(transparentBuffer)
	const trimMeta = await sharp(trimmedBuffer).metadata()
	console.log(
		`  (cropped to ${trimMeta.width}x${trimMeta.height} for favicons)`,
	)

	// Auto-detect dominant colour by sampling opaque, non-white pixels
	const bg = await detectDominantColor(trimmedBuffer)
	console.log(`  (dominant colour: rgb(${bg.r}, ${bg.g}, ${bg.b}))`)

	const makeFavicon = async (size: number): Promise<Buffer> => {
		const pad = Math.round(size * FAVICON_PADDING_RATIO)
		const innerSize = size - pad * 2

		// Scale the icon to fit within the padded inner area
		const iconBuffer = await sharp(trimmedBuffer)
			.resize(innerSize, innerSize, {
				fit: "contain",
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.png()
			.toBuffer()

		// Composite onto a solid background square
		return sharp({
			create: { width: size, height: size, channels: 4, background: bg },
		})
			.composite([{ input: iconBuffer, gravity: "center" }])
			.png()
			.toBuffer()
	}

	for (const size of FAVICON_SIZES) {
		const faviconPath = path.join(faviconDir, `favicon-${size}x${size}.png`)
		const buf = await makeFavicon(size)
		fs.writeFileSync(faviconPath, buf)
		console.log(
			`✓ Favicon ${size}x${size}: ${path.relative(process.cwd(), faviconPath)}`,
		)
	}

	// Root-level favicon.png at 32×32 for browser tab fallback
	const faviconIcoPath = path.join(outputDir, "favicon.png")
	fs.writeFileSync(faviconIcoPath, await makeFavicon(32))
	console.log(
		`✓ favicon.png (32x32): ${path.relative(process.cwd(), faviconIcoPath)}`,
	)

	console.log("\nDone.")
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
