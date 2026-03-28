#!/usr/bin/env bun
/**
 * Crops the middle third of a wide logo image into a square and outputs
 * favicon sizes. Assumes the image already has no white background.
 *
 * Usage: bun scripts/favicon-from-square-crop.ts <input-image> [output-dir]
 */

import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const FAVICON_SIZES = [32, 48, 96, 180, 192, 512]
const PADDING_RATIO = 0.05

async function main() {
	const args = process.argv.slice(2)
	if (args.length < 1) {
		console.error(
			"Usage: bun scripts/favicon-from-square-crop.ts <input-image> [output-dir]",
		)
		process.exit(1)
	}

	const inputPath = path.resolve(args[0])
	if (!fs.existsSync(inputPath)) {
		console.error(`Input file not found: ${inputPath}`)
		process.exit(1)
	}

	const outputDir = args[1] ? path.resolve(args[1]) : path.dirname(inputPath)
	fs.mkdirSync(outputDir, { recursive: true })

	const { width, height } = await sharp(inputPath).metadata()
	if (!width || !height) {
		console.error("Could not read image dimensions")
		process.exit(1)
	}

	console.log(`Input: ${inputPath}`)
	console.log(`Dimensions: ${width}x${height}`)

	// Crop a square from the middle third of the image
	const cropSize = height // square side = full image height
	const left = Math.round((width - cropSize) / 2)

	console.log(`Cropping ${cropSize}x${cropSize} square from x=${left}`)

	const squareBuffer = await sharp(inputPath)
		.extract({ left, top: 0, width: cropSize, height: cropSize })
		.png()
		.toBuffer()

	// Save the square crop for reference
	const squarePath = path.join(outputDir, "favicon-source-square.png")
	fs.writeFileSync(squarePath, squareBuffer)
	console.log(`✓ Square crop: ${path.relative(process.cwd(), squarePath)}`)

	// Output all favicon sizes from the square
	const faviconDir = path.join(outputDir, "favicons")
	fs.mkdirSync(faviconDir, { recursive: true })

	for (const size of FAVICON_SIZES) {
		const pad = Math.round(size * PADDING_RATIO)
		const innerSize = size - pad * 2

		const faviconPath = path.join(faviconDir, `favicon-${size}x${size}.png`)
		await sharp(squareBuffer)
			.resize(innerSize, innerSize, { fit: "cover" })
			.extend({
				top: pad,
				bottom: pad,
				left: pad,
				right: pad,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.png()
			.toFile(faviconPath)
		console.log(
			`✓ Favicon ${size}x${size}: ${path.relative(process.cwd(), faviconPath)}`,
		)
	}

	// Root-level 32x32 for browser fallback
	const faviconPngPath = path.join(outputDir, "favicon.png")
	const pad32 = Math.round(32 * PADDING_RATIO)
	const inner32 = 32 - pad32 * 2
	await sharp(squareBuffer)
		.resize(inner32, inner32, { fit: "cover" })
		.extend({
			top: pad32,
			bottom: pad32,
			left: pad32,
			right: pad32,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toFile(faviconPngPath)
	console.log(
		`✓ favicon.png (32x32): ${path.relative(process.cwd(), faviconPngPath)}`,
	)

	console.log("\nDone.")
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
