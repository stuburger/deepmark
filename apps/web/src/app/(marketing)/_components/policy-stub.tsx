type Props = {
	title: string
	description: string
}

export function PolicyStub({ title, description }: Props) {
	return (
		<div className="mx-auto max-w-2xl px-6 py-24">
			<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
				{title}
			</h1>
			<p className="mt-4 text-base text-muted-foreground">{description}</p>
			<p className="mt-6 text-sm text-muted-foreground">
				For questions in the meantime, contact{" "}
				<a
					href="mailto:hello@getdeepmark.com"
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					hello@getdeepmark.com
				</a>
				.
			</p>
		</div>
	)
}
