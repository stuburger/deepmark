import { redirect } from "next/navigation"
import { Suspense } from "react"

import { PurchaseSuccessToast } from "@/components/purchase-success-toast"
import { PushRegistration } from "@/components/push-registration"
import { IconRail } from "@/components/teacher/icon-rail"
import { MobileAppBar } from "@/components/teacher/mobile-app-bar"
import { TeacherNavProvider } from "@/components/teacher/teacher-nav-context"
import {
	type PlanChip,
	TeacherNavSheet,
} from "@/components/teacher/teacher-nav-sheet"
import { TeacherPageTitleProvider } from "@/components/teacher/teacher-page-title-context"
import { TrialBanner } from "@/components/trial-banner"
import { auth } from "@/lib/auth"
import { getEntitlement } from "@/lib/billing/entitlement"
import type { Entitlement } from "@/lib/billing/entitlement-decision"
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

function derivePlanChip(entitlement: Entitlement): PlanChip {
	if (entitlement.kind === "admin") {
		return { label: "Admin", kind: "info", linkable: false }
	}
	if (entitlement.kind === "uncapped") {
		return { label: "Limitless", kind: "success", linkable: true }
	}
	if (entitlement.plan === "pro_monthly") {
		return { label: "Pro", kind: "info", linkable: true }
	}
	return { label: "Trial", kind: "neutral", linkable: true }
}

export default async function TeacherLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const session = await auth()
	if (!session) redirect("/login")

	const [user, entitlement] = await Promise.all([
		db.user.findUnique({
			where: { id: session.userId },
			select: { name: true, email: true },
		}),
		getEntitlement(session.userId),
	])

	const displayName = deriveDisplayName(user?.name ?? null, user?.email ?? null)
	const initials = deriveInitials(displayName)
	const role = "Teacher"
	const planChip = derivePlanChip(entitlement)
	// Show the "Upgrade to Pro" CTA only to users without an active paid sub
	// (trial / PPU-only). Capped Pro and Limitless already have a plan; Admins
	// bypass billing entirely.
	const showUpgradeCard =
		entitlement.kind === "metered" && entitlement.plan === null

	return (
		<TeacherNavProvider>
			<TeacherPageTitleProvider>
				{/* Wrapper is intentionally transparent so the body's dot-grid texture
				    shows through every cell (icon rail, app bar, main). The shadcn
				    [data-slot="sidebar-inset"] rule in globals.css does the same trick
				    for routes still on the old sidebar pattern.

				    Mobile: single column (no IconRail), row 1 hosts the persistent
				    MobileAppBar (h-12) + TrialBanner. Desktop: 80px IconRail column,
				    row 1 hosts only TrialBanner (app bar is hidden). */}
				<div className="grid h-screen grid-cols-[1fr] grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[80px_1fr]">
					<div className="hidden md:block md:row-span-2 md:col-start-1">
						<IconRail initials={initials} />
					</div>

					<header className="col-start-1 row-start-1 md:col-start-2">
						<MobileAppBar />
						<TrialBanner />
					</header>

					<main
						data-teacher-content
						className="col-start-1 row-start-2 overflow-auto px-4 pb-6 transition-[filter] duration-300 md:col-start-2 md:px-6"
					>
						{children}
					</main>
				</div>

				<TeacherNavSheet
					displayName={displayName}
					role={role}
					initials={initials}
					planChip={planChip}
					showUpgradeCard={showUpgradeCard}
				/>
				<PushRegistration />
				{/* useSearchParams reads the current location; wrap in Suspense per
				    Next.js's static-bailout requirement. */}
				<Suspense fallback={null}>
					<PurchaseSuccessToast />
				</Suspense>
			</TeacherPageTitleProvider>
		</TeacherNavProvider>
	)
}
