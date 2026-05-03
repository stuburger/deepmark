import { redirect } from "next/navigation"

import { PushRegistration } from "@/components/push-registration"
import { IconRail } from "@/components/teacher/icon-rail"
import { TeacherNavProvider } from "@/components/teacher/teacher-nav-context"
import { TeacherNavSheet } from "@/components/teacher/teacher-nav-sheet"
import { TeacherNavbar } from "@/components/teacher/teacher-navbar"
import { TrialBanner } from "@/components/trial-banner"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function deriveDisplayName(name: string | null, email: string | null): string {
	if (name && name.trim().length > 0) return name.trim()
	const username = (email ?? "").split("@")[0]
	if (!username) return "Teacher"
	return username
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ")
}

function deriveInitials(displayName: string): string {
	const tokens = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
	if (tokens.length === 0) return "T"
	return tokens.map((t) => t[0]?.toUpperCase() ?? "").join("") || "T"
}

export default async function TeacherLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const session = await auth()
	if (!session) redirect("/login")

	const user = await db.user.findUnique({
		where: { id: session.userId },
		select: { name: true, email: true },
	})

	const displayName = deriveDisplayName(user?.name ?? null, user?.email ?? null)
	const initials = deriveInitials(displayName)
	const role = "Teacher"

	return (
		<TeacherNavProvider>
			{/* Wrapper is intentionally transparent so the body's dot-grid texture
			    shows through every cell (icon rail, navbar, main). The shadcn
			    [data-slot="sidebar-inset"] rule in globals.css does the same trick
			    for routes still on the old sidebar pattern. */}
			<div className="grid h-screen grid-cols-[80px_1fr] grid-rows-[auto_1fr] overflow-hidden">
				<div className="row-span-2 col-start-1">
					<IconRail initials={initials} />
				</div>

				<header className="col-start-2 row-start-1">
					<TeacherNavbar />
					<TrialBanner />
				</header>

				<main
					data-teacher-content
					className="col-start-2 row-start-2 overflow-auto px-6 pb-6 transition-[filter] duration-300"
				>
					{children}
				</main>
			</div>

			<TeacherNavSheet
				displayName={displayName}
				role={role}
				initials={initials}
			/>
			<PushRegistration />
		</TeacherNavProvider>
	)
}
