"use client"

import { Button } from "@/components/ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { queryKeys } from "@/lib/query-keys"
import { listStudents } from "@/lib/students/queries"
import type { StudentRow } from "@/lib/students/queries"
import { useQuery } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { EditStudentDialog } from "./edit-student-dialog"

type Props = {
	initialStudents: StudentRow[]
}

export function StudentTable({ initialStudents }: Props) {
	const [editing, setEditing] = useState<StudentRow | null>(null)

	const { data: students } = useQuery({
		queryKey: queryKeys.students(),
		queryFn: async () => {
			const r = await listStudents()
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data?.students ?? []
		},
		initialData: initialStudents,
	})

	if (students.length === 0) {
		return (
			<p className="py-12 text-center text-sm text-muted-foreground">
				No students yet. Add one to start matching uploaded scripts.
			</p>
		)
	}

	return (
		<>
			<div className="rounded-md border border-border-quiet bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[140px] font-mono text-[11px] uppercase tracking-wider">
								Number
							</TableHead>
							<TableHead className="font-mono text-[11px] uppercase tracking-wider">
								Name
							</TableHead>
							<TableHead className="font-mono text-[11px] uppercase tracking-wider">
								Class
							</TableHead>
							<TableHead className="font-mono text-[11px] uppercase tracking-wider">
								Year
							</TableHead>
							<TableHead className="text-right font-mono text-[11px] uppercase tracking-wider">
								Submissions
							</TableHead>
							<TableHead className="w-10" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{students.map((s) => (
							<TableRow key={s.id} className="group">
								<TableCell className="font-mono text-sm">
									{s.student_number}
								</TableCell>
								<TableCell className="font-medium">{s.name}</TableCell>
								<TableCell className="text-muted-foreground">
									{s.class_name ?? "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{s.year_group ?? "—"}
								</TableCell>
								<TableCell className="text-right font-mono text-sm">
									{s.submission_count}
								</TableCell>
								<TableCell>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-label={`Edit ${s.name}`}
										className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
										onClick={() => setEditing(s)}
									>
										<Pencil className="size-3.5" strokeWidth={1.5} />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<EditStudentDialog
				student={editing}
				onClose={() => setEditing(null)}
			/>
		</>
	)
}
