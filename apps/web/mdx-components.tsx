import Link from "next/link"
import type { ComponentPropsWithoutRef } from "react"

type MDXComponents = {
	[key: string]: React.ComponentType<Record<string, unknown>>
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		h1: ({ children }: ComponentPropsWithoutRef<"h1">) => (
			<h1 className="mt-12 text-3xl font-semibold tracking-tight first:mt-0 sm:text-4xl">
				{children}
			</h1>
		),
		h2: ({ children }: ComponentPropsWithoutRef<"h2">) => (
			<h2 className="mt-12 text-2xl font-semibold tracking-tight first:mt-0">
				{children}
			</h2>
		),
		h3: ({ children }: ComponentPropsWithoutRef<"h3">) => (
			<h3 className="mt-8 text-lg font-semibold tracking-tight">{children}</h3>
		),
		p: ({ children }: ComponentPropsWithoutRef<"p">) => (
			<p className="mt-4 text-base leading-7 text-foreground/90">{children}</p>
		),
		ul: ({ children }: ComponentPropsWithoutRef<"ul">) => (
			<ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-7 text-foreground/90 marker:text-muted-foreground">
				{children}
			</ul>
		),
		ol: ({ children }: ComponentPropsWithoutRef<"ol">) => (
			<ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7 text-foreground/90 marker:text-muted-foreground">
				{children}
			</ol>
		),
		li: ({ children }: ComponentPropsWithoutRef<"li">) => (
			<li className="pl-1">{children}</li>
		),
		strong: ({ children }: ComponentPropsWithoutRef<"strong">) => (
			<strong className="font-semibold text-foreground">{children}</strong>
		),
		a: ({ href, children }: ComponentPropsWithoutRef<"a">) => {
			const isExternal =
				typeof href === "string" &&
				(href.startsWith("http") || href.startsWith("mailto:"))
			if (isExternal) {
				return (
					<a
						href={href}
						className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
						target={href.startsWith("mailto:") ? undefined : "_blank"}
						rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
					>
						{children}
					</a>
				)
			}
			return (
				<Link
					href={href ?? "#"}
					className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
				>
					{children}
				</Link>
			)
		},
		hr: () => <hr className="my-12 border-border/60" />,
		blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
			<blockquote className="mt-4 border-l-2 border-border pl-4 text-foreground/80 italic">
				{children}
			</blockquote>
		),
		table: ({ children }: ComponentPropsWithoutRef<"table">) => (
			<div className="mt-6 overflow-x-auto">
				<table className="w-full border-collapse text-left text-sm">
					{children}
				</table>
			</div>
		),
		th: ({ children }: ComponentPropsWithoutRef<"th">) => (
			<th className="border-b border-border px-3 py-2 font-semibold">
				{children}
			</th>
		),
		td: ({ children }: ComponentPropsWithoutRef<"td">) => (
			<td className="border-b border-border/40 px-3 py-2 align-top">
				{children}
			</td>
		),
		...components,
	}
}
