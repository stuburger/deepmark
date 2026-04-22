import type { StudentPaperResultPayload } from "../types"

export type PrintLayout = "none" | "duplex" | "duplex_2up"

export type ClassExportMeta = {
	className: string
	teacherName: string
	paperTitle: string
	generatedAt: Date
	printLayout: PrintLayout
}

export type ClassReportInput = {
	meta: ClassExportMeta
	students: StudentPaperResultPayload[]
}

export function paddingFor(layout: PrintLayout): number {
	if (layout === "duplex") return 2
	if (layout === "duplex_2up") return 4
	return 1
}
