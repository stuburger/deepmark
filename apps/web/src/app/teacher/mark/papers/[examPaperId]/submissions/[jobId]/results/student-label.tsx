"use client"

import { QuickAssignStudentDialog } from "@/components/marking/quick-assign-student-dialog"
import { Button } from "@/components/ui/button"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { Link2 } from "lucide-react"
import { useState } from "react"

type Props = {
	jobId: string
	studentId: string | null
	studentName: string | null
	detectedStudentNumber: string | null
}

export function StudentLabel({
	jobId,
	studentId,
	studentName,
	detectedStudentNumber,
}: Props) {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)

	if (studentId !== null) {
		// Linked: name is read-only here. Edits happen in /teacher/students.
		return (
			<span className="text-sm font-semibold">
				{studentName ?? (
					<span className="font-normal italic text-muted-foreground">
						Unknown student
					</span>
				)}
			</span>
		)
	}

	return (
		<>
			<div className="flex items-center gap-2">
				<span className="text-sm font-semibold">
					{studentName ?? (
						<span className="font-normal italic text-muted-foreground">
							Unknown student
						</span>
					)}
				</span>
				{detectedStudentNumber && (
					<span className="rounded-sm border border-border-quiet bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
						{detectedStudentNumber}
					</span>
				)}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
					onClick={() => setOpen(true)}
				>
					<Link2 className="size-3" strokeWidth={1.5} />
					Link student
				</Button>
			</div>
			{open && (
				<QuickAssignStudentDialog
					open={open}
					onOpenChange={setOpen}
					jobId={jobId}
					detectedNumber={detectedStudentNumber}
					onLinked={() => {
						queryClient.invalidateQueries({
							queryKey: queryKeys.studentJob(jobId),
						})
					}}
				/>
			)}
		</>
	)
}
