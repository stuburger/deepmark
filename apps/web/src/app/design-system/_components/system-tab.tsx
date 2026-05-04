import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SoftChip } from "@/components/ui/soft-chip"
import { StatusDot } from "@/components/ui/status-dot"
import { StatusIcon } from "@/components/ui/status-icon"
import { ArrowRight, Check, Plus } from "lucide-react"
import type { LoadedTokens } from "../_lib/load-tokens"
import { IntentBox, Section, SubsectionTitle, WarnBox } from "./section"
import { ScaleRow, Swatch } from "./swatch"

const SHADOW_SAMPLES = [
	{
		name: "shadow-tile",
		usage: "Cards, tiles, AO annotation items, thumbnails",
		className: "shadow-tile",
		raw: "3px 3px 0px rgba(0,0,0,0.12), 1px 1px 4px rgba(0,0,0,0.07)",
	},
	{
		name: "shadow-btn",
		usage: "Primary and secondary buttons",
		className: "shadow-btn",
		raw: "3px 3px 0px rgba(0,0,0,0.2)",
	},
	{
		name: "shadow-confirm",
		usage: "Confirm marking button only",
		className: "shadow-confirm",
		raw: "2px 2px 0px rgba(0,90,110,0.28)",
	},
	{
		name: "shadow-float",
		usage: "Modals and dialogs over the dot grid",
		className: "shadow-float",
		raw: "0 20px 60px rgba(0,0,0,0.18), 0 6px 20px rgba(0,0,0,0.10)",
	},
	{
		name: "shadow-toolbar",
		usage: "Floating editing toolbar only",
		className: "shadow-toolbar",
		raw: "0 4px 16px rgba(0,0,0,0.22), 0 1px 4px rgba(1,173,208,0.18)",
	},
	{
		name: "shadow-sidebar",
		usage: "Expanded sidebar sliding over content",
		className: "shadow-sidebar",
		raw: "4px 0 24px rgba(0,0,0,0.14), 2px 0 6px rgba(0,0,0,0.07)",
	},
] as const

const RADII = [
	{
		name: "--radius-sm",
		value: "5px",
		className: "rounded-sm",
		usage: "Buttons, inputs, badges, chips, cards — universal.",
	},
	{
		name: "--radius-md",
		value: "8px",
		className: "rounded-md",
		usage: "Upload zones, callout panels, expandable feedback panels.",
	},
	{
		name: "--radius-lg",
		value: "10px",
		className: "rounded-xl",
		usage: "Dialogs, modals, floating toolbar — nothing else.",
	},
] as const

const BUTTON_VARIANTS = [
	"default",
	"secondary",
	"confirm",
	"outline",
	"ghost",
	"destructive",
	"link",
] as const

export function SystemTab({ tokens }: { tokens: LoadedTokens }) {
	return (
		<div>
			{/* Principles */}
			<Section
				eyebrow="00 · Principles"
				title="Anti vibe-code principles"
				description="DeepMark is a professional tool for teachers — not a consumer app. Every visual decision should read as intentional."
			>
				<WarnBox label="Never use these">
					<strong>Inter</strong> — replaced with Geist everywhere.
					<br />
					<strong>Pill radius (20px+)</strong> — radii max out at 10px. No
					exceptions.
					<br />
					<strong>Soft brand-coloured glows</strong> — all shadows are hard SE
					offset in black only.
					<br />
					<strong>Purple #6B4FA0</strong> — replaced with teal #01ADD0.
				</WarnBox>
				<IntentBox label="Design intent">
					Brand identity is carried by typography and texture — not colour
					fills. Teal appears as punctuation only. Everything else should feel
					like a serious professional tool.
				</IntentBox>
			</Section>

			{/* Colour anchors */}
			<Section
				eyebrow="01 · Colour"
				title="Brand anchors"
				description="The five anchor colours in tokens.json. Every other shade in the system is derived from these."
			>
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
					<Swatch
						cssVar="color-teal-500"
						name="Accent (teal)"
						hex="#01ADD0"
						usage="Primary CTA · active states · confirm buttons"
					/>
					<Swatch
						cssVar="color-ink-950"
						name="Ink"
						hex="#1A1A1A"
						usage="All text, headings, wordmark. Warm, not pure black."
					/>
					<Swatch
						cssVar="color-success-500"
						name="Success"
						hex="#3C8A62"
						usage="Confirmed / complete states."
					/>
					<Swatch
						cssVar="color-warning-500"
						name="Warning"
						hex="#C4883A"
						usage="Warning states."
					/>
					<Swatch
						cssVar="color-error-500"
						name="Error"
						hex="#C23B3B"
						usage="Destructive actions and error states only. Never brand."
					/>
				</div>

				<SubsectionTitle>Generated scales — 11 shades each</SubsectionTitle>
				<p className="text-xs text-muted-foreground mb-5 max-w-2xl leading-relaxed">
					Anchors come from tokens.json; intermediate shades are OKLCH-derived
					so each step is perceptually uniform. Live values from{" "}
					<span className="font-mono">globals.tokens.css</span>.
				</p>
				{(["teal", "success", "warning", "error", "ink"] as const).map(
					(name) => (
						<ScaleRow key={name} name={name} shades={tokens.scales[name]} />
					),
				)}

				<SubsectionTitle>Status colours — paper cards & kanban</SubsectionTitle>
				<div className="grid grid-cols-3 gap-2.5">
					<Swatch
						cssVar="status-marking"
						name="Marking"
						hex="rgba(255,0,0,0.5)"
						usage="Card border + badge — actively marking"
					/>
					<Swatch
						cssVar="status-review"
						name="Review"
						hex="#7FFFA7"
						usage="Card border + badge — ready for teacher review"
					/>
					<Swatch
						cssVar="status-done"
						name="Done"
						hex="rgba(0,0,0,0.09)"
						usage="Neutral. Done is quiet."
					/>
				</div>

				<SubsectionTitle>Kanban phase border colours</SubsectionTitle>
				<div className="grid grid-cols-4 gap-2.5">
					<Swatch cssVar="phase-queued" name="Queued" hex="rgba(0,0,0,0.12)" />
					<Swatch cssVar="phase-extract" name="Extract" hex="#E8A83A" />
					<Swatch cssVar="phase-grading" name="Grading" hex="#01ADD0" />
					<Swatch cssVar="phase-annotate" name="Annotate" hex="#9B6DD4" />
				</div>
			</Section>

			{/* Typography */}
			<Section
				eyebrow="02 · Typography"
				title="Typography system"
				description="Three fonts. Each has a specific role. Do not substitute or extend."
			>
				<WarnBox label="Critical">
					<strong>Do not use Inter.</strong> Geist replaces it everywhere. Geist
					Mono replaces DM Mono. Lora (Playfair stand-in) is for the dashboard
					greeting only.
				</WarnBox>

				<div className="space-y-2">
					<TypeRow
						sample={
							<span className="font-editorial text-4xl text-foreground -tracking-[0.01em]">
								Good morning, Sarah.
							</span>
						}
						label="Lora 400 — Editorial"
						detail="Dashboard greeting only. 36–52px. One use."
					/>
					<TypeRow
						sample={
							<span className="text-2xl font-semibold text-foreground -tracking-[0.02em]">
								Mark new paper
							</span>
						}
						label="Geist 600 — Headings"
						detail="Section titles, modal headings. tracking: -0.02em. 22–28px."
					/>
					<TypeRow
						sample={
							<span className="text-[15px] font-medium text-foreground -tracking-[0.01em]">
								Paper 2 — Macroeconomics
							</span>
						}
						label="Geist 500 — UI labels"
						detail="Card titles, nav items, button text. 12–15px."
					/>
					<TypeRow
						sample={
							<span className="text-[13px] text-muted-foreground">
								28 scripts · Awaiting review
							</span>
						}
						label="Geist 400 — Body"
						detail="Supporting text, descriptions. 11–13px."
					/>
					<TypeRow
						sample={
							<span className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">
								Monday, 28 April 2025
							</span>
						}
						label="Geist Mono 400 — Eyebrows"
						detail="Date labels, section eyebrows. Uppercase. 9–11px."
					/>
					<TypeRow
						sample={
							<span className="font-mono text-[13px] text-foreground">
								34/43 · 79% · Script 1 of 24
							</span>
						}
						label="Geist Mono 400 — Data"
						detail="All numbers, scores, counts, percentages. 10–13px."
					/>
				</div>
			</Section>

			{/* Radius */}
			<Section
				eyebrow="03 · Spacing & Radius"
				title="Border radius — strict"
				description="5px is the universal radius. No exceptions except the floating toolbar."
			>
				<WarnBox label="Hard rule">
					No element may have border-radius above 10px. Pills (20px+) are
					strictly forbidden — `rounded-full` on text content is banned.
				</WarnBox>
				<div className="grid grid-cols-3 gap-3.5">
					{RADII.map((r) => (
						<div
							key={r.name}
							className="rounded-md bg-card border border-border-subtle px-5 py-5 shadow-tile-quiet"
						>
							<div
								className={`h-12 ${r.className} bg-teal-100 border-2 border-primary mb-3`}
							/>
							<p className="text-[11px] font-medium text-foreground">
								{r.name} · {r.value}
							</p>
							<p className="font-mono text-[10px] text-ink-tertiary mt-0.5">
								border-radius: {r.value}
							</p>
							<p className="text-[10px] text-ink-tertiary mt-1.5 leading-snug">
								{r.usage}
							</p>
						</div>
					))}
				</div>
			</Section>

			{/* Shadows */}
			<Section
				eyebrow="04 · Shadows"
				title="Shadow system"
				description="Hard SE-offset shadows only. No diffuse drop shadows. No brand-coloured glows (one exception: --shadow-toolbar carries a minimal teal glow)."
			>
				<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
					{SHADOW_SAMPLES.map((s) => (
						<div
							key={s.name}
							className={`rounded-md bg-card px-5 py-6 ${s.className}`}
						>
							<p className="text-xs font-medium text-foreground">{s.name}</p>
							<p className="text-[11px] text-muted-foreground mt-1">
								{s.usage}
							</p>
							<p className="font-mono text-[9px] text-ink-tertiary mt-2 leading-relaxed">
								{s.raw}
							</p>
						</div>
					))}
				</div>
			</Section>

			{/* Background */}
			<Section
				eyebrow="05 · Background"
				title="Page background — dot grid"
				description="Full bleed behind all content. Never contained in a box. White tiles sit on top."
			>
				<div className="rounded-md h-24 bg-background shadow-tile-quiet border border-border-subtle" />
				<p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
					Applied to <span className="font-mono">body</span> in light mode via{" "}
					<span className="font-mono">--texture-image</span>. Dropped in dark
					mode (solid background only).
				</p>
			</Section>

			{/* Components: Buttons */}
			<Section
				eyebrow="06 · Components"
				title="Buttons — 7 variants"
				description="Rendered live from <Button> + buttonVariants. If a variant looks wrong here, the spec and the code disagree — fix the code, not the spec."
			>
				<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
					<div className="flex flex-wrap items-end gap-4">
						{BUTTON_VARIANTS.map((variant) => (
							<div key={variant} className="flex flex-col gap-1.5">
								<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
									{variant}
								</span>
								<Button variant={variant}>
									{variant === "default" && <Plus />}
									{variant === "confirm" && <Check />}
									{labelFor(variant)}
									{variant === "link" && <ArrowRight />}
								</Button>
							</div>
						))}
					</div>
				</div>

				<SubsectionTitle>Sizes — default variant</SubsectionTitle>
				<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
					<div className="flex flex-wrap items-end gap-4">
						{(["xs", "sm", "default", "lg"] as const).map((size) => (
							<div key={size} className="flex flex-col gap-1.5">
								<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
									{size}
								</span>
								<Button size={size}>Mark new paper</Button>
							</div>
						))}
					</div>
				</div>
			</Section>

			{/* Components: Badges */}
			<Section
				eyebrow="06 · Components"
				title="Badges"
				description="Domain badges from spec — paper status, score pills, AO/WWW/EBI tags, kanban phase chips."
			>
				<SubsectionTitle>Paper status</SubsectionTitle>
				<div className="flex flex-wrap items-center gap-2 mb-2">
					<Badge variant="status-marking">Marking</Badge>
					<Badge variant="status-review">Review</Badge>
					<Badge variant="status-done">Done</Badge>
				</div>

				<SubsectionTitle>Score pills</SubsectionTitle>
				<div className="flex flex-wrap items-center gap-2 mb-2">
					<Badge variant="score-full">3/3</Badge>
					<Badge variant="score-part">5/6</Badge>
					<Badge variant="score-low">0/4</Badge>
				</div>

				<SubsectionTitle>AO + feedback tags</SubsectionTitle>
				<div className="flex flex-wrap items-center gap-2 mb-2">
					<Badge variant="ao1">AO1</Badge>
					<Badge variant="ao2">AO2</Badge>
					<Badge variant="ao3">AO3</Badge>
					<Badge variant="www">WWW</Badge>
					<Badge variant="ebi">EBI</Badge>
				</div>

				<SubsectionTitle>Kanban phase</SubsectionTitle>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="phase-queued">Queued</Badge>
					<Badge variant="phase-extract">Extract</Badge>
					<Badge variant="phase-grading">Grading</Badge>
					<Badge variant="phase-annotate">Annotate</Badge>
				</div>

				<SubsectionTitle>Default badge variants</SubsectionTitle>
				<div className="flex flex-wrap items-center gap-2">
					<Badge>Default</Badge>
					<Badge variant="secondary">Secondary</Badge>
					<Badge variant="outline">Outline</Badge>
					<Badge variant="destructive">Destructive</Badge>
				</div>
			</Section>

			{/* New primitives */}
			<Section
				eyebrow="06 · Components"
				title="Status primitives"
				description="<StatusDot>, <StatusIcon>, <SoftChip> — added April 2026 to remove ad-hoc colour decisions. Use these instead of hand-rolling bg-success-500 spans."
			>
				<SubsectionTitle>StatusDot — kinds</SubsectionTitle>
				<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
					<div className="flex flex-wrap items-end gap-6">
						{(["success", "warning", "error", "info", "neutral"] as const).map(
							(kind) => (
								<div key={kind} className="flex flex-col items-center gap-2">
									<StatusDot kind={kind} />
									<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
										{kind}
									</span>
								</div>
							),
						)}
					</div>
				</div>

				<SubsectionTitle>StatusIcon — kinds</SubsectionTitle>
				<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
					<div className="flex flex-wrap items-end gap-6">
						{(["success", "warning", "error", "info"] as const).map((kind) => (
							<div key={kind} className="flex flex-col items-center gap-2">
								<StatusIcon kind={kind} className="size-5" />
								<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
									{kind}
								</span>
							</div>
						))}
					</div>
				</div>

				<SubsectionTitle>SoftChip — kinds</SubsectionTitle>
				<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
					<div className="flex flex-wrap items-center gap-2">
						<SoftChip kind="success">Acquired</SoftChip>
						<SoftChip kind="warning">Needs review</SoftChip>
						<SoftChip kind="error">Failed</SoftChip>
						<SoftChip kind="info">Info</SoftChip>
						<SoftChip kind="neutral">Done</SoftChip>
					</div>
				</div>
			</Section>

			{/* Surface taxonomy */}
			<Section
				eyebrow="07 · Architecture"
				title="Surface taxonomy"
				description="Every screen is one of these four. Determines routing, mounting behaviour, and parent lifecycle."
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
					<SurfaceCard
						name="Page (URL route)"
						rule="Has its own IA below it. Sub-routes, nested state, child pages. Parent unmounts on navigate."
						example="Dashboard · All papers · Analytics"
					/>
					<SurfaceCard
						name="URL-state dialog"
						rule="Focused destination, parent stays mounted. Linkable via nuqs query param (?job=…). Survives refresh."
						example="Script viewer (?script=…) · Marking job (?job=…)"
					/>
					<SurfaceCard
						name="Plain dialog"
						rule="Short, scoped, ≤2 steps. Fully reversible by closing. Not linkable."
						example="Mark new paper · Grade boundaries · Delete confirm"
					/>
					<SurfaceCard
						name="Sheet / Drawer"
						rule="Deep secondary context, user keeps their place. Slides over content."
						example="Sidebar nav · AO breakdown panel"
					/>
				</div>
			</Section>

			{/* Card sample */}
			<Section
				eyebrow="06 · Components"
				title="Card / tile"
				description="The chrome unit — every panel sits on a card. White background, --shadow-tile, --radius-sm."
			>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Card className="p-5">
						<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-tertiary">
							Paper
						</p>
						<p className="text-sm font-medium text-foreground mt-1">
							Macroeconomics, Paper 2
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							28 scripts · Awaiting review
						</p>
					</Card>
					<Card className="p-5 shadow-tile">
						<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-tertiary">
							Tile (shadow-tile)
						</p>
						<p className="text-sm font-medium text-foreground mt-1">
							Custom tile
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							Hard SE shadow plus subtle halo.
						</p>
					</Card>
					<Card className="p-5 shadow-float">
						<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-tertiary">
							Float (shadow-float)
						</p>
						<p className="text-sm font-medium text-foreground mt-1">
							Modal-style elevation
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							Used for dialogs over the dot grid.
						</p>
					</Card>
				</div>
			</Section>
		</div>
	)
}

function labelFor(variant: string): string {
	switch (variant) {
		case "default":
			return "Mark new paper"
		case "secondary":
			return "Resume marking"
		case "confirm":
			return "Confirm marking"
		case "outline":
			return "Cancel"
		case "ghost":
			return "More"
		case "destructive":
			return "Delete paper"
		case "link":
			return "View details"
		default:
			return variant
	}
}

function TypeRow({
	sample,
	label,
	detail,
}: {
	sample: React.ReactNode
	label: string
	detail: string
}) {
	return (
		<div className="rounded-md bg-card border border-border-subtle px-6 py-5 shadow-tile-quiet grid grid-cols-1 md:grid-cols-[1fr_220px] items-center gap-6">
			<div>{sample}</div>
			<div>
				<p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-tertiary mb-1">
					{label}
				</p>
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					{detail}
				</p>
			</div>
		</div>
	)
}

function SurfaceCard({
	name,
	rule,
	example,
}: {
	name: string
	rule: string
	example: string
}) {
	return (
		<div className="rounded-md bg-card border border-border-subtle px-5 py-4 shadow-tile-quiet">
			<p className="text-[13px] font-semibold text-foreground mb-1">{name}</p>
			<p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
				{rule}
			</p>
			<p className="font-mono text-[10px] text-teal-700">{example}</p>
		</div>
	)
}
