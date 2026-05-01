import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

import { PapersMarkedCounter } from "./papers-marked-counter"

type Props = {
	papersMarked: number
}

export function HeroSection({ papersMarked }: Props) {
	return (
		<section className="relative overflow-hidden border-b border-border/40">
			<div className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
						Marking all weekend isn't normal.
					</h1>
					<p className="mt-6 text-balance text-lg text-muted-foreground sm:text-xl">
						DeepMark grades your GCSE scripts to examiner standard — so you get
						your evenings back.
					</p>
					<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
						<Link href="/login" className={buttonVariants({ size: "lg" })}>
							Start free
						</Link>
						<Link
							href="#how-it-works"
							className={buttonVariants({ variant: "ghost", size: "lg" })}
						>
							See how it works
						</Link>
					</div>
					<div className="mt-10 flex justify-center">
						<PapersMarkedCounter count={papersMarked} />
					</div>
				</div>
			</div>
		</section>
	)
}
