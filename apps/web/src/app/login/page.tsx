import Image from "next/image"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { loginWithGoogle, loginWithMicrosoft } from "@/lib/actions"
import { auth } from "@/lib/auth"

import { WavyUnderline } from "../(marketing)/_components/mark-ornaments"
import { MarkingFeedbackTags } from "./marking-feedback-tags"

/* Decorative annotation primitives for the demo tile. They mirror the look of
   the editor's annotation marks (`ProseMirror span[data-mark-type=…]` in
   `annotation-marks.css`) using the same `--mark-*` CSS variables, so the tile
   reads as a real screenshot of the marking surface. */

function TickHighlight({ children }: { children: React.ReactNode }) {
	return (
		<span className="px-px" style={{ backgroundColor: "var(--mark-tick-bg)" }}>
			{children}
			<span
				className="ml-0.5 align-baseline text-[0.6em] font-bold"
				style={{ color: "var(--mark-tick-glyph)" }}
			>
				✓
			</span>
		</span>
	)
}

function UnderlineHighlight({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="underline decoration-2 underline-offset-2"
			style={{ textDecorationColor: "var(--mark-underline)" }}
		>
			{children}
		</span>
	)
}

function ChainHighlight({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="px-px"
			style={{ backgroundColor: "var(--mark-chain-judgement-bg)" }}
		>
			{children}
		</span>
	)
}

/* Mimics `@tiptap/extension-collaboration-caret`'s DOM: a thin coloured vertical
   bar with a name label tucked into the top-left, like another examiner is in
   the document right now. */
function CollabCaret({ name }: { name: string }) {
	const colour = "var(--phase-annotate)"
	return (
		<span
			aria-hidden="true"
			className="relative -mx-px inline-block w-px align-baseline"
			style={{ borderLeft: `1px solid ${colour}` }}
		>
			<span
				className="absolute -top-4 left-0 whitespace-nowrap rounded-t-[3px] rounded-br-[3px] px-1 py-0.5 font-sans text-[10px] font-semibold leading-none text-white"
				style={{ backgroundColor: colour }}
			>
				{name}
			</span>
		</span>
	)
}

async function loginWithGoogleFormAction() {
	"use server"
	await loginWithGoogle()
}

async function loginWithMicrosoftFormAction() {
	"use server"
	await loginWithMicrosoft()
}

export default async function LoginPage() {
	const session = await auth()
	if (session) {
		redirect("/teacher")
	}

	return (
		<main className="relative flex min-h-screen">
			{/* Left — brand panel. Hidden on mobile. Inherits the body's paper +
			    dot-grid texture. */}
			<aside className="relative hidden flex-1 flex-col justify-between p-12 lg:flex xl:p-16">
				<div className="flex items-center gap-3">
					<Image
						src="/octopus-logo.png"
						alt=""
						width={40}
						height={40}
						priority
					/>
					<span className="text-xl font-semibold tracking-tight text-foreground">
						DeepMark
					</span>
				</div>

				<div className="flex max-w-xl flex-col gap-10">
					<h2 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground xl:text-5xl">
						Marking,{" "}
						<span className="relative inline-block whitespace-nowrap">
							done
							<WavyUnderline className="absolute -bottom-2 left-0 h-2 w-full text-error-500 xl:-bottom-3 xl:h-3" />
						</span>
						.
					</h2>

					<div className="relative max-w-md rounded-[5px] bg-card p-6 pt-7 shadow-tile [transform:rotate(-0.6deg)]">
						<div className="flex items-baseline justify-between gap-4">
							<p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
								Q5 (c) — 6 marks
							</p>
							<p className="font-mono text-xs font-medium text-success-700">
								5 / 6
							</p>
						</div>

						<p className="mt-4 font-handwriting text-xl leading-relaxed text-foreground">
							During photosynthesis, chlorophyll in the chloroplasts{" "}
							<TickHighlight>absorbs light energy</TickHighlight>. This is then
							used to{" "}
							<UnderlineHighlight>
								convert water and carbon dioxide into glucose
							</UnderlineHighlight>
							, releasing <TickHighlight>oxygen</TickHighlight> as a byproduct.
							The process is{" "}
							<ChainHighlight>essential for life on Earth</ChainHighlight>
							<CollabCaret name="Ms. Patel" />— it underpins almost every food
							chain and produces the air we breathe.
						</p>

						<MarkingFeedbackTags />
					</div>
				</div>

				<p className="text-xs text-muted-foreground">© DeepMark, 2026</p>
			</aside>

			{/* Right — sign-in panel. */}
			<section className="relative flex w-full flex-col justify-center px-6 py-16 sm:px-12 lg:w-105 lg:shrink-0 lg:border-l lg:border-border-quiet">
				<div className="mx-auto flex w-full max-w-sm flex-col gap-8">
					{/* Mobile-only wordmark — the left panel is hidden below lg, so the
					    mark needs to appear here for the brand to be visible at all. */}
					<div className="flex items-center gap-3 lg:hidden">
						<Image
							src="/octopus-logo.png"
							alt=""
							width={36}
							height={36}
							priority
						/>
						<span className="text-lg font-semibold tracking-tight text-foreground">
							DeepMark
						</span>
					</div>

					<div className="space-y-1.5">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">
							Sign in
						</h1>
						<p className="text-sm text-muted-foreground">
							Continue with your Google or Microsoft account.
						</p>
					</div>

					<div className="flex flex-col gap-3">
						<form action={loginWithGoogleFormAction}>
							<Button type="submit" variant="outline" className="w-full">
								<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
									<path
										d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
										fill="#4285F4"
									/>
									<path
										d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
										fill="#34A853"
									/>
									<path
										d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
										fill="#FBBC05"
									/>
									<path
										d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
										fill="#EA4335"
									/>
								</svg>
								Continue with Google
							</Button>
						</form>

						<form action={loginWithMicrosoftFormAction}>
							<Button type="submit" variant="outline" className="w-full">
								<svg className="size-4" viewBox="0 0 23 23" aria-hidden="true">
									<path d="M1 1h10v10H1z" fill="#F25022" />
									<path d="M12 1h10v10H12z" fill="#7FBA00" />
									<path d="M1 12h10v10H1z" fill="#00A4EF" />
									<path d="M12 12h10v10H12z" fill="#FFB900" />
								</svg>
								Continue with Microsoft
							</Button>
						</form>
					</div>

					<p className="text-xs text-muted-foreground">
						By signing in you agree to our terms of service.
					</p>
				</div>
			</section>
		</main>
	)
}
