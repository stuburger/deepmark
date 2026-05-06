import { Heading as RHeading } from "@react-email/components"
import type { ReactNode } from "react"

import { colors, spacing } from "../_tokens"

type Props = {
	children: ReactNode
}

export function Heading({ children }: Props) {
	return (
		<RHeading
			as="h1"
			style={{
				fontSize: "24px",
				lineHeight: "32px",
				fontWeight: 600,
				color: colors.ink950,
				margin: `0 0 ${spacing.md} 0`,
				letterSpacing: "-0.01em",
			}}
		>
			{children}
		</RHeading>
	)
}
