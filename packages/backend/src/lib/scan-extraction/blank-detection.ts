import sharp from "sharp"

export const DEFAULT_BLANK_THRESHOLD = 0.005 // 0.5% ink coverage

export async function computeInkDensity(jpegBuffer: Buffer): Promise<number> {
	const { data, info } = await sharp(jpegBuffer)
		.greyscale()
		.raw()
		.toBuffer({ resolveWithObject: true })
	const dark = (data as Buffer).filter((p: number) => p < 128).length
	return dark / (info.width * info.height)
}

export async function isBlankPage(
	jpegBuffer: Buffer,
	threshold = DEFAULT_BLANK_THRESHOLD,
): Promise<boolean> {
	return (await computeInkDensity(jpegBuffer)) < threshold
}
