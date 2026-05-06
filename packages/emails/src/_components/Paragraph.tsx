import { Text } from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import { colors, spacing } from "../_tokens"

type Props = {
	children: ReactNode
	muted?: boolean
	style?: CSSProperties
}

export function Paragraph({ children, muted, style }: Props) {
	return (
		<Text
			style={{
				fontSize: "15px",
				lineHeight: "24px",
				color: muted ? colors.ink600 : colors.ink900,
				margin: `0 0 ${spacing.md} 0`,
				...style,
			}}
		>
			{children}
		</Text>
	)
}
