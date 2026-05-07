// Next.js 16 / React 19 sets the `react-server` export condition for
// server actions, which gates the default `react-dom/server` entry. The
// `.edge` subpath is environment-agnostic and bypasses that gate — it
// works in Node (Lambda + vitest) and in the Edge runtime.
//
// `renderToStaticMarkup` (rather than `renderToString`) skips the
// `data-reactroot` / `data-react-*` attributes that hydration needs.
// We never hydrate this HTML — Chromium just prints it — so static
// markup is both cleaner and slightly smaller.
import { renderToStaticMarkup } from "react-dom/server.edge"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "../../types"
import type { ClassExportMeta } from "../types"
import { Cover } from "./cover"
import { Legend } from "./legend"
import { PrintDocument } from "./print-document"
import { StudentSection } from "./student-section"

export type CoverDocumentProps = {
	meta: ClassExportMeta
	students: StudentPaperResultPayload[]
}

export type StudentDocumentProps = {
	meta: ClassExportMeta
	student: StudentPaperResultPayload
	/** Pass `[]` for an unannotated export. */
	annotations: StudentPaperAnnotation[]
	/** Pass `[]` for an unannotated export. */
	pageTokens: PageToken[]
}

/**
 * Render the class-level cover as a self-contained HTML document.
 * Caller is expected to omit this for single-student exports.
 */
export function renderCoverDocument(props: CoverDocumentProps): string {
	const title = props.meta.className
		? `${props.meta.className} — Cover`
		: "Class report — Cover"
	const body = renderToStaticMarkup(
		<PrintDocument title={title}>
			<Cover meta={props.meta} students={props.students} />
		</PrintDocument>,
	)
	return `<!doctype html>${body}`
}

export type LegendDocumentProps = {
	meta: ClassExportMeta
	aoLabels: string[]
}

/**
 * Render the annotation key as a self-contained HTML document. Caller
 * decides when to include it (typically when `includeAnnotations` is on
 * and any submission carries annotations).
 */
export function renderLegendDocument(props: LegendDocumentProps): string {
	const title = props.meta.className
		? `${props.meta.className} — Annotation key`
		: "Annotation key"
	const body = renderToStaticMarkup(
		<PrintDocument title={title}>
			<Legend aoLabels={props.aoLabels} />
		</PrintDocument>,
	)
	return `<!doctype html>${body}`
}

/**
 * Render one student's section as a self-contained HTML document.
 * One per student in the class; the renderer Lambda prints each
 * independently and concats with sheet-boundary padding between.
 */
export function renderStudentDocument(props: StudentDocumentProps): string {
	const title = props.student.student_name
		? `${props.student.student_name} — ${props.meta.paperTitle || "Class report"}`
		: props.meta.paperTitle || "Class report"
	const body = renderToStaticMarkup(
		<PrintDocument title={title}>
			<StudentSection
				student={props.student}
				annotations={props.annotations}
				pageTokens={props.pageTokens}
			/>
		</PrintDocument>,
	)
	return `<!doctype html>${body}`
}
