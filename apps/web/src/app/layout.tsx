import type { Metadata } from "next"
import { Geist, Geist_Mono, Indie_Flower, Lora } from "next/font/google"
import localFont from "next/font/local"

import { Providers } from "@/components/providers"

import "./globals.css"

const geist = Geist({
	variable: "--font-geist",
	subsets: ["latin"],
	weight: ["300", "400", "500", "600"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	weight: ["300", "400"],
})

const lora = Lora({
	variable: "--font-lora",
	subsets: ["latin"],
	weight: ["400"],
	display: "swap",
})

const indieFlower = Indie_Flower({
	variable: "--font-indie-flower",
	subsets: ["latin"],
	weight: "400",
	display: "swap",
})

const haveIdea = localFont({
	src: "../fonts/HaveIdea.ttf",
	variable: "--font-have-idea",
	display: "swap",
})

export const metadata: Metadata = {
	title: "DeepMark",
	description: "Web app for scan review and marking",
	// Icons are auto-discovered by Next.js App Router from `src/app/`:
	// `favicon.ico`, `icon.png`, `apple-icon.png`. Regenerate with
	// `bun run gen:favicon` after replacing `public/octopus-logo.png`.
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			className={`${geist.variable} ${geistMono.variable} ${lora.variable} ${indieFlower.variable} ${haveIdea.variable}`}
			suppressHydrationWarning
		>
			<body className="antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	)
}
