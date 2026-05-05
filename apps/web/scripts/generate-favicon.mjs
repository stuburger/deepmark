// Generates the Next.js App Router icon set from a single source PNG.
// Run: bun run gen:favicon
//
// Input:  apps/web/public/octopus-logo.png
// Output: src/app/icon.png        — 512px PWA / fallback
//         src/app/apple-icon.png  — 180px Apple touch
//         src/app/favicon.ico     — multi-size 16/32/48 ICO
//
// The source image is read-only; auto-crop just trims transparent padding
// before re-canvasing each output size with a small inset so the mark
// doesn't kiss the edge.

import fs from "node:fs/promises"
import path from "node:path"
import pngToIco from "png-to-ico"
import sharp from "sharp"

const projectRoot = process.cwd()
const inputLogoPath = path.join(projectRoot, "public", "octopus-logo.png")
const appDir = path.join(projectRoot, "src", "app")

async function detectAlphaBounds(imagePath) {
	const image = sharp(imagePath).ensureAlpha()
	const { data, info } = await image
		.raw()
		.toBuffer({ resolveWithObject: true })

	let minX = info.width
	let minY = info.height
	let maxX = -1
	let maxY = -1

	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			const i = (y * info.width + x) * info.channels
			const alpha = data[i + 3]
			if (alpha > 0) {
				if (x < minX) minX = x
				if (y < minY) minY = y
				if (x > maxX) maxX = x
				if (y > maxY) maxY = y
			}
		}
	}

	if (maxX < 0) return null
	return {
		left: minX,
		top: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	}
}

async function createSquarePng(croppedBuffer, size, insetFraction) {
	const innerSize = Math.max(1, Math.round(size * (1 - insetFraction * 2)))
	const resized = await sharp(croppedBuffer)
		.resize({
			width: innerSize,
			height: innerSize,
			fit: "inside",
			withoutEnlargement: false,
		})
		.png()
		.toBuffer()

	const left = Math.floor((size - innerSize) / 2)
	const top = Math.floor((size - innerSize) / 2)

	return sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([{ input: resized, left, top }])
		.png()
		.toBuffer()
}

async function main() {
	await fs.access(inputLogoPath).catch(() => {
		throw new Error(
			`Source logo not found: ${inputLogoPath}\n` +
				"Place the master PNG at apps/web/public/octopus-logo.png and try again.",
		)
	})
	await fs.mkdir(appDir, { recursive: true })

	const bounds = await detectAlphaBounds(inputLogoPath)
	if (!bounds) {
		throw new Error("No visible pixels found in input logo.")
	}

	const croppedBuffer = await sharp(inputLogoPath)
		.extract(bounds)
		.png()
		.toBuffer()

	const iconPng = await createSquarePng(croppedBuffer, 512, 0.08)
	await fs.writeFile(path.join(appDir, "icon.png"), iconPng)

	const appleIconPng = await createSquarePng(croppedBuffer, 180, 0.12)
	await fs.writeFile(path.join(appDir, "apple-icon.png"), appleIconPng)

	const ico16 = await createSquarePng(croppedBuffer, 16, 0.12)
	const ico32 = await createSquarePng(croppedBuffer, 32, 0.12)
	const ico48 = await createSquarePng(croppedBuffer, 48, 0.12)
	const faviconIco = await pngToIco([ico16, ico32, ico48])
	await fs.writeFile(path.join(appDir, "favicon.ico"), faviconIco)

	console.log("Generated:")
	console.log(`  ${path.relative(projectRoot, path.join(appDir, "icon.png"))}`)
	console.log(
		`  ${path.relative(projectRoot, path.join(appDir, "apple-icon.png"))}`,
	)
	console.log(
		`  ${path.relative(projectRoot, path.join(appDir, "favicon.ico"))}`,
	)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
