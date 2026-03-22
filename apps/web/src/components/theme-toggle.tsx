"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import * as React from "react"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type ThemeToggleProps = {
	className?: string
	align?: "start" | "center" | "end"
}

export function ThemeToggle({ className, align = "end" }: ThemeToggleProps) {
	const [mounted, setMounted] = React.useState(false)
	const { theme, setTheme } = useTheme()

	React.useEffect(() => {
		setMounted(true)
	}, [])

	const resolvedValue =
		theme === "light" || theme === "dark" || theme === "system"
			? theme
			: "system"

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				type="button"
				aria-label="Theme"
				disabled={!mounted}
				className={cn(
					buttonVariants({ variant: "ghost", size: "icon" }),
					"relative shrink-0",
					className,
				)}
			>
				<Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
				<Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="min-w-36">
				<DropdownMenuRadioGroup
					value={resolvedValue}
					onValueChange={(value) => {
						if (value === "light" || value === "dark" || value === "system") {
							setTheme(value)
						}
					}}
				>
					<DropdownMenuRadioItem value="light">
						<Sun className="size-4" />
						Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon className="size-4" />
						Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<Monitor className="size-4" />
						System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
