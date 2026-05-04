import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const TOKENS_JSON_PATH = resolve(
	process.cwd(),
	"../../geoff_ui_claude_design/v2/deepmark_tokens.json",
)
const GENERATED_CSS_PATH = resolve(process.cwd(), "src/app/globals.tokens.css")

export type ScaleName = "teal" | "success" | "warning" | "error" | "ink"

export type LoadedTokens = {
	tokensJsonText: string
	generatedCss: string
	scales: Record<ScaleName, { shade: number; hex: string }[]>
}

/**
 * Surfaces both halves of the token system to the Design System page:
 *   • tokens.json — Geoff's canonical source of truth
 *   • globals.tokens.css — the generator's output
 *
 * Both files are read fresh at request time so the page always reflects the
 * working tree. The parsed scale shades back the Design System tab so each
 * swatch shows the literal hex value that ships, not a re-derivation.
 *
 * Note on production: the tokens.json file lives outside apps/web. If this
 * page is deployed to a serverless target (SST/Lambda), wire the path into
 * next.config's `outputFileTracingIncludes` so the file ships in the bundle.
 */
export async function loadTokens(): Promise<LoadedTokens> {
	const [tokensJsonText, generatedCss] = await Promise.all([
		readFile(TOKENS_JSON_PATH, "utf8"),
		readFile(GENERATED_CSS_PATH, "utf8"),
	])

	const scales: Record<ScaleName, { shade: number; hex: string }[]> = {
		teal: [],
		success: [],
		warning: [],
		error: [],
		ink: [],
	}
	const re =
		/--color-(teal|success|warning|error|ink)-(\d{2,3}):\s*(#[0-9a-fA-F]{3,8})/g
	for (const match of generatedCss.matchAll(re)) {
		const name = match[1] as ScaleName
		const shade = Number(match[2])
		const hex = (match[3] ?? "").toLowerCase()
		scales[name].push({ shade, hex })
	}
	for (const name of Object.keys(scales) as ScaleName[]) {
		scales[name].sort((a, b) => a.shade - b.shade)
	}

	return { tokensJsonText, generatedCss, scales }
}
