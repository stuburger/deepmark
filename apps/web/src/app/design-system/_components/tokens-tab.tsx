import type { LoadedTokens } from "../_lib/load-tokens"
import { CopyButton } from "./copy-button"
import { Section } from "./section"

function CodeBlock({
	title,
	subtitle,
	code,
	copyLabel,
}: {
	title: string
	subtitle: string
	code: string
	copyLabel: string
}) {
	return (
		<div className="mb-10">
			<div className="flex items-end justify-between mb-3 gap-3">
				<div>
					<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-tertiary mb-1">
						{title}
					</p>
					<p className="text-xs text-muted-foreground">{subtitle}</p>
				</div>
				<CopyButton value={code} label={copyLabel} />
			</div>
			<pre className="rounded-md bg-foreground text-background/85 px-5 py-4 text-[11px] leading-relaxed font-mono overflow-x-auto max-h-[640px]">
				{code}
			</pre>
		</div>
	)
}

export function TokensTab({ tokens }: { tokens: LoadedTokens }) {
	return (
		<Section
			eyebrow="Source of truth"
			title="Design tokens"
			description="Two files. tokens.json is Geoff's canonical input — anchors only. globals.tokens.css is the generated 11-shade scale derivation that ships in the app. Edit tokens.json and run `bun gen:tokens` to regenerate; CI fails if the two drift."
		>
			<CodeBlock
				title="tokens.json — source"
				subtitle="geoff_ui_claude_design/v2/deepmark_tokens.json"
				code={tokens.tokensJsonText}
				copyLabel="Copy JSON"
			/>
			<CodeBlock
				title="globals.tokens.css — generated"
				subtitle="apps/web/src/app/globals.tokens.css · do not hand-edit"
				code={tokens.generatedCss}
				copyLabel="Copy CSS"
			/>
		</Section>
	)
}
