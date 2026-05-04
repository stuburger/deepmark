import { SidebarTrigger } from "@/components/ui/sidebar"

type AppNavbarProps = {
	icon?: React.ReactNode
	title?: string
}

// Dark mode is disabled for the initial release (see providers.tsx). When it
// comes back, re-add `<ThemeToggle align="end" />` after the title block.
export function AppNavbar({ icon, title }: AppNavbarProps) {
	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-sm">
			<SidebarTrigger className="-ml-1" />
			<div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground/80">
				{icon}
				{title && <span className="truncate">{title}</span>}
			</div>
		</header>
	)
}
