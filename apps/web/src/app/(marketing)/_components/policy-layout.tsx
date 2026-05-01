type Props = {
	title: string
	lastUpdated: string
	children: React.ReactNode
}

export function PolicyLayout({ title, lastUpdated, children }: Props) {
	const formatted = new Date(lastUpdated).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	})

	return (
		<article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
			<header className="border-b border-border/60 pb-8">
				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
					{title}
				</h1>
				<p className="mt-3 text-sm text-muted-foreground">
					Last updated {formatted}
				</p>
			</header>
			<div className="pt-2">{children}</div>
		</article>
	)
}
