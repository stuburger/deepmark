"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, BookOpen, Plus } from "lucide-react"
import { SubsectionTitle } from "./section"

export function DialogsSection() {
	return (
		<div>
			<SubsectionTitle>Standard dialog — default size</SubsectionTitle>
			<p className="text-[11px] text-muted-foreground mb-4 leading-relaxed max-w-xl">
				Every <span className="font-mono">DialogContent</span> receives a 3px
				primary teal top border automatically. Combined with{" "}
				<span className="font-mono">rounded-xl</span>, the left corner shows a
				distinctive branded blue accent — the same visual punctuation Geoff uses
				in the editor mockup.
			</p>

			<div className="rounded-md bg-card border border-border-subtle p-6 shadow-tile-quiet">
				<div className="flex flex-wrap gap-3 items-start">
					{/* Plain dialog */}
					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[9px] uppercase tracking-widest text-ink-tertiary">
							Default
						</span>
						<Dialog>
							<DialogTrigger render={<Button variant="outline" />}>
								Open dialog
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Mark new paper</DialogTitle>
									<DialogDescription>
										Upload a question paper and mark scheme to get started.
										Gemini will extract all questions automatically.
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-3 py-1">
									<div className="grid gap-1.5">
										<Label htmlFor="paper-title">Paper title</Label>
										<Input
											id="paper-title"
											placeholder="e.g. Economics Paper 2 — 2025"
										/>
									</div>
									<div className="grid gap-1.5">
										<Label htmlFor="subject">Subject</Label>
										<Input id="subject" placeholder="e.g. Economics" />
									</div>
								</div>
								<DialogFooter showCloseButton>
									<Button>
										<Plus />
										Create paper
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>

					{/* Destructive dialog */}
					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[9px] uppercase tracking-widest text-ink-tertiary">
							Destructive
						</span>
						<Dialog>
							<DialogTrigger
								render={<Button variant="destructive" size="sm" />}
							>
								Delete paper
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle className="flex items-center gap-2">
										<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
										Delete exam paper
									</DialogTitle>
									<DialogDescription>
										This will permanently delete{" "}
										<strong>Economics Paper 2</strong> and all 28 student
										submissions. This action cannot be undone.
									</DialogDescription>
								</DialogHeader>
								<DialogFooter showCloseButton>
									<Button variant="destructive">Delete paper</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>

					{/* Info dialog */}
					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[9px] uppercase tracking-widest text-ink-tertiary">
							Info / wider
						</span>
						<Dialog>
							<DialogTrigger render={<Button variant="secondary" />}>
								<BookOpen />
								Mark scheme help
							</DialogTrigger>
							<DialogContent className="sm:max-w-lg">
								<DialogHeader>
									<DialogTitle>Mark scheme types</DialogTitle>
									<DialogDescription>
										DeepMark supports three marking methods. Choose the right
										one for your exam paper.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-3 py-1">
									{MARK_SCHEME_TYPES.map((t) => (
										<div
											key={t.name}
											className="rounded-md border border-border-subtle px-3.5 py-3 bg-muted/40"
										>
											<p className="text-[12px] font-semibold text-foreground mb-0.5">
												{t.name}
											</p>
											<p className="text-[11px] text-muted-foreground leading-relaxed">
												{t.description}
											</p>
										</div>
									))}
								</div>
								<DialogFooter showCloseButton />
							</DialogContent>
						</Dialog>
					</div>
				</div>
			</div>

			<SubsectionTitle>Anatomy</SubsectionTitle>
			<div className="rounded-md bg-card border border-border-subtle p-5 shadow-tile-quiet font-mono text-[10px] leading-relaxed text-muted-foreground">
				<div className="text-foreground font-semibold mb-2 not-italic text-[11px]">
					Dialog structure
				</div>
				<pre className="whitespace-pre-wrap leading-[1.9]">
					{`<Dialog>
  <DialogTrigger>…</DialogTrigger>
  <DialogContent>                   ← border-t-[3px] border-t-primary always
    <DialogHeader>
      <DialogTitle>…</DialogTitle>
      <DialogDescription>…</DialogDescription>
    </DialogHeader>

    {/* body content */}

    <DialogFooter showCloseButton>  ← bg-muted/50, auto Close button
      <Button>Primary action</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`}
				</pre>
			</div>

			<SubsectionTitle>Token reference</SubsectionTitle>
			<div className="rounded-md bg-card border border-border-subtle overflow-hidden shadow-tile-quiet">
				<table className="w-full text-[11px]">
					<thead>
						<tr className="border-b border-border-subtle bg-muted/40">
							<th className="text-left px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-tertiary font-normal">
								Property
							</th>
							<th className="text-left px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-tertiary font-normal">
								Value
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						{DIALOG_TOKENS.map((t) => (
							<tr key={t.property}>
								<td className="px-4 py-2.5 font-mono text-primary">
									{t.property}
								</td>
								<td className="px-4 py-2.5 text-muted-foreground">{t.value}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

const MARK_SCHEME_TYPES = [
	{
		name: "Point-based",
		description:
			"LLM awards marks per individual mark point. Best for 2–6 mark questions where discrete knowledge points can be isolated.",
	},
	{
		name: "Level of response",
		description:
			"AQA-style level descriptors with caps. For 9–12 mark extended writing where holistic judgement is needed.",
	},
	{
		name: "Deterministic (MCQ)",
		description:
			"Pure letter comparison — no LLM. Used for multiple choice questions with a single correct letter answer.",
	},
]

const DIALOG_TOKENS = [
	{
		property: "border-radius",
		value: "--radius-lg (10px) via rounded-xl — dialogs & modals only",
	},
	{
		property: "top accent border",
		value: "3px solid var(--primary) — teal #01ADD0, always present",
	},
	{ property: "shadow", value: "--shadow-float (0 20px 60px + 0 6px 20px)" },
	{ property: "background", value: "--card (white tile)" },
	{ property: "overlay", value: "bg-black/10 + backdrop-blur-xs" },
	{
		property: "footer",
		value: "bg-muted/50, border-t, -mx-4 -mb-4 bleed to edges",
	},
]
