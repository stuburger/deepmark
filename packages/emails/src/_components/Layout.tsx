import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components"
import type { ReactNode } from "react"

import { colors, radii, spacing, typography } from "../_tokens"

type Props = {
	preview: string
	children: ReactNode
	/**
	 * Public URL of the octopus logo. The web app serves it at
	 * `/octopus-logo.png`; the email subscriber prepends the deployed origin so
	 * Gmail / Outlook / Apple Mail can fetch the image. Defaulted to a stable
	 * public URL so the preview pages render without extra wiring.
	 */
	logoUrl?: string
}

const DEFAULT_LOGO_URL = "https://getdeepmark.com/octopus-logo.png"

export function Layout({ preview, children, logoUrl }: Props) {
	const resolvedLogoUrl = logoUrl ?? DEFAULT_LOGO_URL
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body
				style={{
					backgroundColor: colors.pageBg,
					fontFamily: typography.fontFamily,
					margin: 0,
					padding: `${spacing.lg} 0`,
					color: colors.ink950,
				}}
			>
				<Container
					style={{
						maxWidth: "560px",
						margin: "0 auto",
						padding: `0 ${spacing.md}`,
					}}
				>
					<Section style={{ paddingBottom: spacing.lg }}>
						<Link
							href="https://getdeepmark.com"
							style={{ textDecoration: "none" }}
						>
							<Img
								src={resolvedLogoUrl}
								alt="DeepMark"
								width="40"
								height="40"
								style={{ display: "block" }}
							/>
						</Link>
					</Section>

					<Section
						style={{
							backgroundColor: colors.cardBg,
							borderRadius: radii.tile,
							padding: spacing.xl,
							border: `1px solid ${colors.ink200}`,
						}}
					>
						{children}
					</Section>

					<Hr
						style={{
							borderColor: colors.ink200,
							margin: `${spacing.xl} 0 ${spacing.md} 0`,
						}}
					/>

					<Text
						style={{
							color: colors.ink600,
							fontSize: "12px",
							lineHeight: "18px",
							margin: 0,
						}}
					>
						DeepMark — examiner-quality marking for GCSE teachers.{" "}
						<Link
							href="https://getdeepmark.com"
							style={{ color: colors.teal700 }}
						>
							getdeepmark.com
						</Link>
					</Text>
					<Text
						style={{
							color: colors.ink500,
							fontSize: "12px",
							lineHeight: "18px",
							margin: `${spacing.xs} 0 0 0`,
						}}
					>
						You're receiving this because you have a DeepMark account. This is a
						service email about your account; it isn't a marketing message.
					</Text>
				</Container>
			</Body>
		</Html>
	)
}
