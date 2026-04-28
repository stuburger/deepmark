"use client"

import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { useState } from "react"
import { NewExamPaperDialog } from "./new-exam-paper-dialog"

export function NewExamPaperButton() {
	const [open, setOpen] = useState(false)

	return (
		<>
			<Button onClick={() => setOpen(true)}>
				<PlusCircle className="h-4 w-4 mr-2" />
				New exam paper
			</Button>
			<NewExamPaperDialog open={open} onOpenChange={setOpen} />
		</>
	)
}
