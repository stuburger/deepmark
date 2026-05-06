"use client"

type Props = {
	html: string
}

/**
 * Render an email's HTML inside an `srcDoc` iframe so its styles can't leak
 * into the surrounding admin shell. Sized to a single email's natural width
 * with a small height that grows with content via the `onLoad` resize.
 */
export function EmailFrame({ html }: Props) {
	return (
		<iframe
			title="Email preview"
			srcDoc={html}
			className="h-[640px] w-full max-w-2xl rounded-md border border-border bg-card"
			sandbox="allow-same-origin"
			onLoad={(e) => {
				const frame = e.currentTarget
				const body = frame.contentDocument?.body
				if (body) {
					frame.style.height = `${body.scrollHeight + 32}px`
				}
			}}
		/>
	)
}
