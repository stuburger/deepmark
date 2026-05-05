import Image from "next/image"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

export function MarketingNav() {
	return (
		<header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
				<Link
					href="/"
					className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
				>
					<Image
						src="/octopus-logo.png"
						alt=""
						width={28}
						height={28}
						priority
						className="size-7"
					/>
					DeepMark
				</Link>
				<nav className="flex items-center gap-1">
					<Link
						href="/pricing"
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Pricing
					</Link>
					<Link
						href="/login"
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Sign in
					</Link>
					<Link href="/login" className={buttonVariants({ size: "sm" })}>
						Start free
					</Link>
				</nav>
			</div>
		</header>
	)
}
