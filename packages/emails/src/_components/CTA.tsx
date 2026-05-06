import { Button } from "@react-email/components"

import { colors, radii, spacing, typography } from "../_tokens"

type Props = {
	href: string
	children: string
}

/**
 * Single primary CTA per email. Teal punctuation per the design spec —
 * never as a large filled chrome surface, but a CTA button is exactly the
 * place teal is meant to live.
 */
export function CTA({ href, children }: Props) {
	return (
		<Button
			href={href}
			style={{
				backgroundColor: colors.teal500,
				color: colors.cardBg,
				borderRadius: radii.tile,
				padding: `${spacing.sm} ${spacing.lg}`,
				fontFamily: typography.fontFamily,
				fontSize: "15px",
				fontWeight: 600,
				textDecoration: "none",
				display: "inline-block",
				// Hard SE-offset shadow per spec — no diffuse glow.
				boxShadow: `2px 2px 0 ${colors.ink950}`,
			}}
		>
			{children}
		</Button>
	)
}
