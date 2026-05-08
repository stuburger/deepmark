"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useState } from "react"
import { NewStudentDialog } from "./new-student-dialog"

export function NewStudentButton() {
	const [open, setOpen] = useState(false)
	return (
		<>
			<Button onClick={() => setOpen(true)}>
				<Plus className="size-4" strokeWidth={1.5} />
				New student
			</Button>
			<NewStudentDialog open={open} onOpenChange={setOpen} />
		</>
	)
}
