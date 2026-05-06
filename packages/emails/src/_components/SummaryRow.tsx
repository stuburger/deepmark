import { Section, Text } from "@react-email/components"

import { colors, radii, spacing } from "../_tokens"

type Props = {
	label: string
	value: string
}

/**
 * Small bordered row used for "Plan: Pro", "Papers added: 30", etc. — the
 * receipt-y bit of a transactional email.
 */
export function SummaryRow({ label, value }: Props) {
	return (
		<Section
			style={{
				border: `1px solid ${colors.ink200}`,
				borderRadius: radii.tile,
				padding: `${spacing.sm} ${spacing.md}`,
				marginBottom: spacing.sm,
				backgroundColor: colors.surface,
			}}
		>
			<table cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
				<tbody>
					<tr>
						<td style={{ fontSize: "13px", color: colors.ink600 }}>{label}</td>
						<td
							style={{
								fontSize: "14px",
								color: colors.ink950,
								fontWeight: 600,
								textAlign: "right",
							}}
						>
							{value}
						</td>
					</tr>
				</tbody>
			</table>
		</Section>
	)
}
