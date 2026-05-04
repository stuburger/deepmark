"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getQueryClient } from "@/lib/query-client"

type ProvidersProps = {
	children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
	// useState ensures the client is created once per component instance,
	// not once per module (which would share state across SSR requests).
	const [queryClient] = useState(() => getQueryClient())

	return (
		<QueryClientProvider client={queryClient}>
			<NuqsAdapter>
				{/* Dark mode is intentionally disabled for the initial release
				    via `forcedTheme="light"`. The .dark block in globals.css and
				    the ThemeToggle component (apps/web/src/components/theme-toggle.tsx)
				    are kept in place but inert — re-enabling is a one-line revert
				    here plus re-rendering ThemeToggle in the navbars. */}
				<ThemeProvider
					attribute="class"
					defaultTheme="light"
					forcedTheme="light"
					enableSystem={false}
					disableTransitionOnChange
				>
					<TooltipProvider>
						{children}
						<Toaster richColors />
					</TooltipProvider>
				</ThemeProvider>
			</NuqsAdapter>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	)
}
