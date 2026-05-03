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
	title: "Deepmark",
	description: "Web app for scan review and marking",
	icons: {
		icon: [
			{ url: "/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
			{ url: "/favicons/favicon-48x48.png", sizes: "48x48", type: "image/png" },
			{ url: "/favicons/favicon-96x96.png", sizes: "96x96", type: "image/png" },
			{
				url: "/favicons/favicon-192x192.png",
				sizes: "192x192",
				type: "image/png",
			},
		],
		shortcut: "/favicons/favicon-32x32.png",
		apple: {
			url: "/favicons/favicon-180x180.png",
			sizes: "180x180",
			type: "image/png",
		},
	},
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
