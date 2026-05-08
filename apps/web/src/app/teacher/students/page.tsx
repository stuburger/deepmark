import { listStudents } from "@/lib/students/queries"
import { NewStudentButton } from "./new-student-button"
import { StudentTable } from "./student-table"

export default async function StudentsPage() {
	const result = await listStudents()
	const students = result?.data?.students ?? []
	const error = result?.serverError ?? null

	return (
		<div className="space-y-6 pt-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Students</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Your class roster.
					</p>
				</div>
				<NewStudentButton />
			</div>

			{error ? (
				<p className="text-sm text-destructive">{error}</p>
			) : (
				<StudentTable initialStudents={students} />
			)}
		</div>
	)
}
