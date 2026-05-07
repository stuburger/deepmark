import type { ReactNode } from "react"
import { PRINT_CSS } from "./print-styles"

/**
 * Shared HTML shell for every printable section (cover + each student).
 * Each section is rendered as its own self-contained document so the
 * Lambda can print them independently and concat with sheet-boundary
 * padding between sections — see `mergeSections` in the renderer Lambda.
 */
export function PrintDocument({
	title,
	children,
}: {
	title: string
	children: ReactNode
}) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<title>{title}</title>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: print styles are a static module-scoped string */}
				<style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
			</head>
			<body>{children}</body>
		</html>
	)
}
