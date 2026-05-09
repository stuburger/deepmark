"use client"

import { QuickAssignStudentDialog } from "@/components/marking/quick-assign-student-dialog"
import { Button } from "@/components/ui/button"
import { queryKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { Link2, Pencil } from "lucide-react"
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

	const isLinked = studentId !== null
	const onLinked = () => {
		queryClient.invalidateQueries({
			queryKey: queryKeys.studentJob(jobId),
		})
	}

	return (
		<>
			<div className="group flex items-center gap-2">
				<span className="text-sm font-semibold">
					{studentName ?? (
						<span className="font-normal italic text-muted-foreground">
							Unknown student
						</span>
					)}
				</span>
				{!isLinked && detectedStudentNumber && (
					<span className="rounded-sm border border-border-quiet bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
						{detectedStudentNumber}
					</span>
				)}
				{isLinked ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label="Change linked student"
						className="h-6 w-6 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
						onClick={() => setOpen(true)}
					>
						<Pencil className="size-3" strokeWidth={1.5} />
					</Button>
				) : (
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
				)}
			</div>
			{open && (
				<QuickAssignStudentDialog
					open={open}
					onOpenChange={setOpen}
					jobId={jobId}
					detectedNumber={detectedStudentNumber}
					currentStudentId={studentId}
					onLinked={onLinked}
				/>
			)}
		</>
	)
}
