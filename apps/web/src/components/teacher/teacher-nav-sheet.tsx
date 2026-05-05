"use client"

import {
	BarChart3,
	ClipboardList,
	Clock,
	FileText,
	HelpCircle,
	LayoutDashboard,
	LogOut,
	Settings,
	X,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, SVGProps } from "react"

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet"
import { SoftChip, type SoftChipKind } from "@/components/ui/soft-chip"
import { logoutFormAction } from "@/lib/actions"
import { cn } from "@/lib/utils"

import { useTeacherNav } from "./teacher-nav-context"

export type PlanChip = {
	label: string
	kind: SoftChipKind
	/** When false (admin), the chip renders as static text — no billing link. */
	linkable: boolean
}

type NavItem = {
	href: string
	label: string
	Icon: ComponentType<SVGProps<SVGSVGElement>>
	exact?: boolean
}

const PRIMARY_ITEMS: NavItem[] = [
	{ href: "/teacher", label: "Dashboard", Icon: LayoutDashboard, exact: true },
]

const RECENT_ITEMS: NavItem[] = [
	{ href: "/teacher/mark", label: "Recent marking", Icon: Clock },
]

const ALL_ITEMS: NavItem[] = [
	{ href: "/teacher/exam-papers", label: "All papers", Icon: ClipboardList },
]

const INSIGHT_ITEMS: NavItem[] = [
	{ href: "/teacher/analytics", label: "Analytics", Icon: BarChart3 },
	{ href: "/teacher/reports", label: "Reports", Icon: FileText },
]

const TOOL_ITEMS: NavItem[] = [
	{ href: "/teacher/help", label: "Help", Icon: HelpCircle },
]

const FOOTER_ITEMS: NavItem[] = [
	{ href: "/teacher/settings", label: "Settings", Icon: Settings },
]

type TeacherNavSheetProps = {
	displayName: string
	role: string
	initials: string
	avatarUrl: string | null
	planChip: PlanChip
	showUpgradeCard: boolean
}

export function TeacherNavSheet({
	displayName,
	role,
	initials,
	avatarUrl,
	planChip,
	showUpgradeCard,
}: TeacherNavSheetProps) {
	const { open, setOpen } = useTeacherNav()

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent
				side="left"
				showCloseButton={false}
				className={cn(
					"w-[min(340px,90vw)] !max-w-[340px] gap-0 rounded-r-md border-r-0 bg-background p-0 shadow-sidebar",
					"data-[side=left]:sm:max-w-[340px]",
				)}
				style={{
					backgroundImage: "var(--texture-image)",
					backgroundSize: "var(--texture-size)",
				}}
			>
				<SheetTitle className="sr-only">Teacher navigation</SheetTitle>
				<SheetDescription className="sr-only">
					Primary product navigation for the teacher experience.
				</SheetDescription>

				<div className="flex items-center justify-between px-5 py-5">
					<span className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
						<Image
							src="/octopus-logo.png"
							alt=""
							width={28}
							height={28}
							className="size-7"
						/>
						DeepMark
					</span>
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label="Close menu"
						className="flex size-8 items-center justify-center rounded-md text-foreground hover:bg-primary/10"
					>
						<X className="size-[18px]" strokeWidth={1.5} />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto py-2">
					<NavSection items={PRIMARY_ITEMS} onNavigate={() => setOpen(false)} />
					<NavSection items={RECENT_ITEMS} onNavigate={() => setOpen(false)}>
						<RecentMarkingSubmenuStub />
					</NavSection>
					<NavSection items={ALL_ITEMS} onNavigate={() => setOpen(false)} />

					<NavLabel>Insight</NavLabel>
					<NavSection items={INSIGHT_ITEMS} onNavigate={() => setOpen(false)} />

					<NavLabel>Tools</NavLabel>
					<NavSection items={TOOL_ITEMS} onNavigate={() => setOpen(false)} />
				</div>

				<div className="flex flex-col gap-3 border-t border-border-quiet px-4 py-4">
					{showUpgradeCard ? (
						<UpgradeCard onNavigate={() => setOpen(false)} />
					) : null}
					<NavSection
						items={FOOTER_ITEMS}
						onNavigate={() => setOpen(false)}
						compact
					/>
					<form action={logoutFormAction}>
						<button
							type="submit"
							className="flex w-full items-center gap-3 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-primary/10"
						>
							<span className="flex size-5 shrink-0 items-center justify-center text-current">
								<LogOut className="size-5" strokeWidth={1.5} />
							</span>
							Log out
						</button>
					</form>
					<UserProfile
						displayName={displayName}
						role={role}
						initials={initials}
						avatarUrl={avatarUrl}
						planChip={planChip}
						onNavigate={() => setOpen(false)}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}

function NavSection({
	items,
	onNavigate,
	compact = false,
	children,
}: {
	items: NavItem[]
	onNavigate: () => void
	compact?: boolean
	children?: React.ReactNode
}) {
	const pathname = usePathname()
	return (
		<div>
			{items.map(({ href, label, Icon, exact }) => {
				const isActive = exact
					? pathname === href
					: pathname === href || pathname.startsWith(`${href}/`)
				return (
					<Link
						key={href}
						href={href}
						onClick={onNavigate}
						className={cn(
							"flex w-full items-center gap-3 px-4 text-[15px] text-foreground transition-colors",
							compact ? "py-2.5" : "py-3",
							isActive ? "bg-primary/15 text-primary" : "hover:bg-primary/10",
						)}
					>
						<span className="flex size-5 shrink-0 items-center justify-center text-current">
							<Icon className="size-5" strokeWidth={1.5 as unknown as number} />
						</span>
						{label}
					</Link>
				)
			})}
			{children}
		</div>
	)
}

function NavLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-2 px-4 pt-3 pb-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary">
			{children}
		</div>
	)
}

function RecentMarkingSubmenuStub() {
	return (
		<div className="ml-2 border-l-2 border-primary/20 bg-primary/5">
			<div className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-tertiary">
				Coming soon
			</div>
		</div>
	)
}

function UpgradeCard({ onNavigate }: { onNavigate: () => void }) {
	return (
		<Link
			href="/teacher/settings/billing"
			onClick={onNavigate}
			className="block rounded-md border border-primary/20 bg-primary/10 p-3 transition-colors hover:bg-primary/15"
		>
			<div className="text-[13px] font-semibold text-primary">
				Upgrade to Pro
			</div>
			<div className="mt-1 text-[11px] leading-snug text-ink-secondary">
				Multiple classes per month · Advanced analytics · Test feedback lesson
				plans and more.
			</div>
		</Link>
	)
}

function UserProfile({
	displayName,
	role,
	initials,
	avatarUrl,
	planChip,
	onNavigate,
}: {
	displayName: string
	role: string
	initials: string
	avatarUrl: string | null
	planChip: PlanChip
	onNavigate: () => void
}) {
	return (
		<div className="flex items-center gap-2.5 py-2">
			<div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-primary font-mono text-[12px] font-semibold text-paper-white">
				{avatarUrl ? (
					// biome-ignore lint/performance/noImgElement: Google avatar host isn't in next/image remotePatterns.
					<img
						src={avatarUrl}
						alt=""
						referrerPolicy="no-referrer"
						className="size-full object-cover"
					/>
				) : (
					initials
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-[13px] font-medium text-foreground">
						{displayName}
					</span>
					{planChip.linkable ? (
						<Link
							href="/teacher/settings/billing"
							onClick={onNavigate}
							aria-label={`Plan: ${planChip.label} — manage billing`}
							className="rounded-md transition-opacity hover:opacity-80"
						>
							<SoftChip kind={planChip.kind}>{planChip.label}</SoftChip>
						</Link>
					) : (
						<SoftChip kind={planChip.kind}>{planChip.label}</SoftChip>
					)}
				</div>
				<div className="truncate text-[11px] text-ink-secondary">{role}</div>
			</div>
		</div>
	)
}
