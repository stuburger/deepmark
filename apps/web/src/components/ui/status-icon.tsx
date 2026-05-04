import { cn } from "@/lib/utils"
import {
	AlertCircle,
	CheckCircle2,
	type LucideIcon,
	XCircle,
	Zap,
} from "lucide-react"
import type { ComponentProps } from "react"

const KIND_TO_ICON: Record<StatusIconKind, LucideIcon> = {
	success: CheckCircle2,
	warning: Zap,
	error: XCircle,
	info: AlertCircle,
}

const KIND_TO_COLOUR: Record<StatusIconKind, string> = {
	success: "text-success",
	warning: "text-warning",
	error: "text-destructive",
	info: "text-primary",
}

export type StatusIconKind = "success" | "warning" | "error" | "info"

type StatusIconProps = {
	kind: StatusIconKind
} & Omit<ComponentProps<LucideIcon>, "ref">

export function StatusIcon({ kind, className, ...rest }: StatusIconProps) {
	const Icon = KIND_TO_ICON[kind]
	return <Icon className={cn(KIND_TO_COLOUR[kind], className)} {...rest} />
}
