"use client"

import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { BookText } from "lucide-react"
import { useState } from "react"
import { LevelDescriptorsDialog } from "./level-descriptors-dialog"

export function MarkingGuidanceButton({
	examPaperId,
	initialValue,
}: {
	examPaperId: string
	initialValue: string | null
}) {
	const [open, setOpen] = useState(false)
	const [savedValue, setSavedValue] = useState(initialValue)
	const hasContent = (savedValue ?? "").length > 0

	return (
		<>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setOpen(true)}
								className="relative text-muted-foreground hover:text-foreground"
							>
								<BookText className="h-3.5 w-3.5" />
								{hasContent && (
									<span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
								)}
								<span className="sr-only">Marking guidance</span>
							</Button>
						}
					/>
					<TooltipContent>
						{hasContent ? "Marking guidance set" : "Add marking guidance"}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<LevelDescriptorsDialog
				open={open}
				onOpenChange={setOpen}
				examPaperId={examPaperId}
				initialValue={savedValue}
				onSaved={(v) => setSavedValue(v)}
			/>
		</>
	)
}
