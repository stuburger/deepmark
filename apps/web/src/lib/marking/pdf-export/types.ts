export type PrintLayout = "none" | "duplex" | "duplex_2up"

export type ClassExportMeta = {
	className: string
	teacherName: string
	paperTitle: string
	generatedAt: Date
	printLayout: PrintLayout
}
