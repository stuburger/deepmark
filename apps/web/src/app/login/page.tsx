import Image from "next/image"
import { auth } from "@/lib/auth"
import { login } from "@/lib/actions"
import { redirect } from "next/navigation"
import { Github } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default async function LoginPage() {
	const session = await auth()
	if (session) {
		redirect("/")
	}

	return (
		<main className="relative flex min-h-screen">
			{/* Full-bleed background image behind everything */}
			<Image
				src="/deepmark-login.png"
				alt=""
				fill
				priority
				className="object-cover object-center"
			/>

			{/* Left side — image shows through, spacer */}
			<div className="relative hidden flex-1 lg:block" />

			{/* Right side — full-height frosted glass panel */}
			<div className="relative z-10 flex w-full flex-col justify-center gap-8 border-l border-white/15 bg-black/45 px-12 py-16 backdrop-blur-md lg:w-105 lg:shrink-0">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight text-white">Sign in</h1>
					<p className="text-sm text-white/60">
						Use your GitHub account to access Deepmark.
					</p>
				</div>

				<Separator className="bg-white/15" />

				<form action={login}>
					<Button type="submit" variant="outline" className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
						<Github className="size-4" />
						Continue with GitHub
					</Button>
				</form>

				<p className="text-center text-xs text-white/40">
					By signing in you agree to our terms of service.
				</p>
			</div>
		</main>
	)
}
