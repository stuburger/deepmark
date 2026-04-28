"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Trash2 } from "lucide-react"

type Props = {
	criteria: string
	index: number
	disabled: boolean
	isOnly: boolean
	onChange: (value: string) => void
	onRemove: () => void
}

export function MarkPointRow({
	criteria,
	index,
	disabled,
	isOnly,
	onChange,
	onRemove,
}: Props) {
	return (
		<div className="flex items-start gap-2">
			<div className="relative flex-1">
				<Textarea
					value={criteria}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					placeholder={`Mark point ${index + 1}`}
					rows={4}
					className="text-sm resize-y pb-6"
				/>
				<span className="pointer-events-none absolute bottom-2 left-3 text-[11px] font-medium text-muted-foreground tabular-nums">
					1 mark
				</span>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onRemove}
				disabled={disabled || isOnly}
				className="shrink-0 mt-1 text-muted-foreground hover:text-destructive"
			>
				<Trash2 className="h-4 w-4" />
			</Button>
		</div>
	)
}
