import { QueryClient } from "@tanstack/react-query"

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// With SSR we set a stale time > 0 to avoid refetching immediately on mount
				staleTime: 10 * 1000,
			},
		},
	})
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
	if (typeof window === "undefined") {
		// Server: always make a new client (avoids sharing state between requests)
		return makeQueryClient()
	}
	// Browser: reuse existing client, create one if it doesn't exist yet
	if (!browserQueryClient) browserQueryClient = makeQueryClient()
	return browserQueryClient
}
