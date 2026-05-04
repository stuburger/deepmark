import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Metadata } from "next"
import { SystemTab } from "./_components/system-tab"
import { TokensTab } from "./_components/tokens-tab"
import { loadTokens } from "./_lib/load-tokens"

export const metadata: Metadata = {
	title: "DeepMark — Design System",
	description: "Visual reference for DeepMark's design tokens and components.",
}

export default async function DesignSystemPage() {
	const tokens = await loadTokens()
	const version =
		tokens.tokensJsonText.match(/"version":\s*"([^"]+)"/)?.[1] ?? "—"

	return (
		<div className="mx-auto max-w-[1080px] px-6 py-12 sm:px-10 sm:py-16">
			<header className="border-b-2 border-foreground pb-9 mb-12">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-tertiary mb-3">
					Internal reference · Design + Engineering · v{version}
				</p>
				<h1 className="font-editorial text-5xl text-foreground -tracking-[0.01em] leading-[1.05] mb-3">
					DeepMark
					<br />
					Design System
				</h1>
				<p className="text-sm text-muted-foreground max-w-xl leading-relaxed mb-5">
					Live visual reference. Every component on this page is rendered from
					the actual codebase, so any drift between Geoff's spec and the shipped
					UI shows up here. Tokens are read fresh at request time from{" "}
					<span className="font-mono">tokens.json</span> +{" "}
					<span className="font-mono">globals.tokens.css</span>.
				</p>
				<div className="flex flex-wrap gap-2">
					<span className="font-mono text-[10px] px-2.5 py-0.5 rounded-sm bg-teal-50 text-teal-700 border border-teal-200">
						v{version}
					</span>
					<span className="font-mono text-[10px] px-2.5 py-0.5 rounded-sm bg-teal-50 text-teal-700 border border-teal-200">
						Geist + Lora
					</span>
					<span className="font-mono text-[10px] px-2.5 py-0.5 rounded-sm bg-warning-50 text-warning-700 border border-warning-200">
						No Inter · No pill radius · No soft glow · No purple
					</span>
				</div>
			</header>

			<Tabs defaultValue="system" className="w-full">
				<TabsList variant="line" className="mb-10 h-10">
					<TabsTrigger value="system" className="px-4">
						Design System
					</TabsTrigger>
					<TabsTrigger value="tokens" className="px-4">
						Tokens
					</TabsTrigger>
				</TabsList>

				<TabsContent value="system">
					<SystemTab tokens={tokens} />
				</TabsContent>

				<TabsContent value="tokens">
					<TokensTab tokens={tokens} />
				</TabsContent>
			</Tabs>

			<footer className="border-t border-border-subtle pt-7 mt-16 flex items-center justify-between">
				<div>
					<p className="font-mono text-[10px] text-ink-tertiary">
						DeepMark Design System · v{version}
					</p>
					<p className="text-xs text-muted-foreground mt-1">
						Geoff (design) · Stu Bourhill (engineering)
					</p>
				</div>
				<p className="font-editorial text-2xl text-foreground/25">DeepMark</p>
			</footer>
		</div>
	)
}
