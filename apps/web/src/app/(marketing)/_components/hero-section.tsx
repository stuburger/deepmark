import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

import { EditorScreenshotPlaceholder } from "./editor-screenshot-placeholder"
import { MarkTick, MarkedStamp, WavyUnderline } from "./mark-ornaments"

export function HeroSection() {
	return (
		<section className="relative">
			<MarkTick
				aria-hidden
				className="pointer-events-none absolute left-[calc(50%-30rem)] top-32 hidden size-12 text-error-500 [transform:rotate(-22deg)] lg:block"
			/>

			<div className="mx-auto max-w-6xl px-6 pt-24 pb-16 sm:pt-32 sm:pb-20">
				<div className="mx-auto max-w-4xl text-center sm:text-left">
					<h1
						className="marketing-rise text-balance text-5xl font-semibold tracking-[-0.02em] text-foreground sm:text-7xl md:text-[5.5rem] md:leading-[0.95]"
						style={{ animationDelay: "60ms" }}
					>
						Get your{" "}
						<span className="relative inline-block whitespace-nowrap">
							life
							<WavyUnderline className="absolute -bottom-2 left-0 h-2 w-full text-error-500 sm:-bottom-3 sm:h-3" />
						</span>{" "}
						back.
					</h1>
					<p
						className="marketing-rise mt-8 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl"
						style={{ animationDelay: "180ms" }}
					>
						<strong className="font-medium text-foreground">
							Marking over the weekend isn't normal.
						</strong>{" "}
						We've just collectively agreed to pretend it is.
					</p>
					<p
						className="marketing-rise mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg"
						style={{ animationDelay: "260ms" }}
					>
						Mark a full class in under an hour — with consistent, actionable
						feedback for every student, and more depth than you could
						realistically write.
					</p>
					<div
						className="marketing-rise mt-10 flex flex-col items-center gap-3 sm:items-start"
						style={{ animationDelay: "360ms" }}
					>
						<Link
							href="/login"
							className={buttonVariants({
								size: "lg",
								className: "shadow-btn",
							})}
						>
							Try DeepMark
						</Link>
						<p className="text-sm text-muted-foreground">
							Mark your first 20 papers free — no card required.
						</p>
					</div>
				</div>
			</div>

			<div
				className="marketing-rise mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32"
				style={{ animationDelay: "500ms" }}
			>
				<div className="relative [transform:rotate(-0.6deg)]">
					<EditorScreenshotPlaceholder />
					<MarkedStamp className="absolute -right-3 -top-6 [transform:rotate(-12deg)] sm:-right-6 sm:-top-8" />
				</div>
			</div>
		</section>
	)
}
