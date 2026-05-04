// Top navbar for teacher routes. Geoff's v2 design has an empty top strip and
// dark mode is disabled for the initial release (see providers.tsx), so this
// header has nothing to host right now. Kept as a placeholder so the layout
// grid still has a row-1 element — when dark mode comes back, drop a
// <ThemeToggle align="end" /> back in here.
export function TeacherNavbar() {
	return <header className="flex h-12 shrink-0 items-center justify-end px-4" />
}
