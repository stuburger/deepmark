import { login, loginWithGoogle } from "@/lib/actions"
import { auth } from "@/lib/auth"

async function loginFormAction() {
	"use server"
	await login()
}

async function loginWithGoogleFormAction() {
	"use server"
	await loginWithGoogle()
}
import { Github } from "lucide-react"
import Image from "next/image"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default async function LoginPage() {
	const session = await auth()
	if (session) {
		redirect("/teacher/mark")
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
					<h1 className="text-2xl font-semibold tracking-tight text-white">
						Sign in
					</h1>
					<p className="text-sm text-white/60">
						Sign in with GitHub or Google to access Deepmark.
					</p>
				</div>

				<Separator className="bg-white/15" />

				<div className="flex flex-col gap-3">
					<form action={loginFormAction}>
						<Button
							type="submit"
							variant="outline"
							className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
						>
							<Github className="size-4" />
							Continue with GitHub
						</Button>
					</form>

					<form action={loginWithGoogleFormAction}>
						<Button
							type="submit"
							variant="outline"
							className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
						>
							<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
									fill="#4285F4"
								/>
								<path
									d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
									fill="#34A853"
								/>
								<path
									d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
									fill="#FBBC05"
								/>
								<path
									d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
									fill="#EA4335"
								/>
							</svg>
							Continue with Google
						</Button>
					</form>
				</div>

				<p className="text-center text-xs text-white/40">
					By signing in you agree to our terms of service.
				</p>
			</div>
		</main>
	)
}
