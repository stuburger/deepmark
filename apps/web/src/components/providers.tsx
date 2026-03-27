"use client"

import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

type ProvidersProps = {
	children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
	return (
		<NuqsAdapter>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
			>
				<TooltipProvider>
					{children}
					<Toaster richColors />
				</TooltipProvider>
			</ThemeProvider>
		</NuqsAdapter>
	)
}
