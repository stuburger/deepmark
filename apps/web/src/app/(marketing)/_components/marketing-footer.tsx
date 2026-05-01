import Link from "next/link"

export function MarketingFooter() {
	return (
		<footer className="border-t border-border/40 bg-background">
			<div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
				<div className="space-y-2">
					<p className="text-sm font-semibold">DeepMark</p>
					<p className="text-xs text-muted-foreground">
						Examiner-quality GCSE marking.
					</p>
				</div>
				<FooterColumn
					heading="Product"
					links={[
						{ label: "Pricing", href: "/pricing" },
						{ label: "Sign in", href: "/login" },
					]}
				/>
				<FooterColumn
					heading="Trust"
					links={[
						{ label: "Privacy", href: "/privacy" },
						{ label: "Safeguarding", href: "/safeguarding" },
						{ label: "Terms", href: "/terms" },
					]}
				/>
				<FooterColumn
					heading="Contact"
					links={[
						{
							label: "hello@getdeepmark.com",
							href: "mailto:hello@getdeepmark.com",
						},
					]}
				/>
			</div>
			<div className="border-t border-border/40">
				<div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted-foreground">
					© {new Date().getFullYear()} DeepMark. All rights reserved.
				</div>
			</div>
		</footer>
	)
}

function FooterColumn({
	heading,
	links,
}: {
	heading: string
	links: { label: string; href: string }[]
}) {
	return (
		<div className="space-y-2">
			<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{heading}
			</p>
			<ul className="space-y-1.5">
				{links.map((l) => (
					<li key={l.href}>
						<Link
							href={l.href}
							className="text-sm text-foreground/80 transition-colors hover:text-foreground"
						>
							{l.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}
