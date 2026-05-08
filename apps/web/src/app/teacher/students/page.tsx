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
						Build your roster so OCR can match uploaded scripts to the right
						student. Numbers handwritten on page 1 of each script (e.g.{" "}
						<code className="font-mono text-xs">S-042</code>) are how the
						extraction step links a submission deterministically.
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
