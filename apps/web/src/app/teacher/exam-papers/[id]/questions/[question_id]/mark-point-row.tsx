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
		<div className="flex items-start gap-2 rounded-md border border-input/60 p-2">
			<Textarea
				value={criteria}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				placeholder={`Mark point ${index + 1}`}
				rows={2}
				className="flex-1 text-sm resize-y min-h-[2.5rem]"
			/>
			<span className="shrink-0 mt-2 text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
				1 mark
			</span>
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
