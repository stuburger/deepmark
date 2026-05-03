import { ThemeToggle } from "@/components/theme-toggle"

// Top navbar for teacher routes. Geoff's v2 design has an empty top strip — we
// keep a thin header here just to host the theme toggle. The persistent icon
// rail (left) carries primary nav now, so this stays intentionally bare.
export function TeacherNavbar() {
	return (
		<header className="flex h-12 shrink-0 items-center justify-end px-4">
			<ThemeToggle align="end" />
		</header>
	)
}
