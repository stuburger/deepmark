import Link from "next/link"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export default async function HomePage() {
	const session = await auth()

	if (!session) {
		redirect("/login")
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6 py-16">
			<Card className="w-full">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Home
						<Badge variant="secondary">Signed in</Badge>
					</CardTitle>
					<CardDescription>You are signed in with SST Auth.</CardDescription>
				</CardHeader>
				<CardContent>
					<Separator className="mb-4" />
					<Tooltip>
						<TooltipTrigger className="w-full text-left">
							<p className="rounded-md bg-muted px-3 py-2 font-mono text-sm">
								userId: {session.userId}
							</p>
						</TooltipTrigger>
						<TooltipContent>Unique authenticated user identifier</TooltipContent>
					</Tooltip>
				</CardContent>
				<CardFooter className="flex flex-wrap gap-2">
					<Link href="/scan/upload" className={cn(buttonVariants())}>
						Upload handwriting
					</Link>
					<form action="/api/logout" method="get">
						<Button type="submit" variant="outline">
							Logout
						</Button>
					</form>
				</CardFooter>
			</Card>
		</main>
	)
}
