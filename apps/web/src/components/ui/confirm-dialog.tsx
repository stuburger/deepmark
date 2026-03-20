"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

export type ConfirmDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: string
	confirmLabel?: string
	/** When true the confirm button renders as destructive. Defaults to true. */
	destructive?: boolean
	loading?: boolean
	onConfirm: () => void
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirm",
	destructive = true,
	loading = false,
	onConfirm,
}: ConfirmDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="max-w-sm">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						disabled={loading}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={loading}
						onClick={onConfirm}
					>
						{loading && <Spinner className="h-3.5 w-3.5 mr-1.5" />}
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
