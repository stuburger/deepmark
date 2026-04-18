import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { queryKeys } from "@/lib/query-keys"
import { invalidateOnStageTransitions } from "../stages/transitions"
import type { JobStages, StageStatus } from "../stages/types"

function stage(status: StageStatus) {
	return {
		status,
		runId: null,
		startedAt: null,
		completedAt: null,
		error: null,
	}
}

function build(
	ocr: StageStatus,
	grading: StageStatus,
	enrichment: StageStatus,
): JobStages {
	return {
		jobId: "job_1",
		ocr: stage(ocr),
		grading: stage(grading),
		enrichment: stage(enrichment),
	}
}

describe("invalidateOnStageTransitions", () => {
	it("is a no-op when prev is null (initial snapshot)", () => {
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(qc, "job_1", null, build("done", "done", "done"))
		expect(spy).not.toHaveBeenCalled()
	})

	it("invalidates studentJob + scan urls + page tokens when OCR flips to done", () => {
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(
			qc,
			"job_1",
			build("generating", "not_started", "not_started"),
			build("done", "not_started", "not_started"),
		)
		expect(spy).toHaveBeenCalledWith({
			queryKey: queryKeys.studentJob("job_1"),
		})
		expect(spy).toHaveBeenCalledWith({
			queryKey: queryKeys.jobScanUrls("job_1"),
		})
		expect(spy).toHaveBeenCalledWith({
			queryKey: queryKeys.jobPageTokens("job_1"),
		})
	})

	it("invalidates studentJob when grading flips to done", () => {
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(
			qc,
			"job_1",
			build("done", "generating", "not_started"),
			build("done", "done", "not_started"),
		)
		expect(spy).toHaveBeenCalledWith({
			queryKey: queryKeys.studentJob("job_1"),
		})
	})

	it("invalidates jobAnnotations when enrichment flips to done", () => {
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(
			qc,
			"job_1",
			build("done", "done", "generating"),
			build("done", "done", "done"),
		)
		expect(spy).toHaveBeenCalledWith({
			queryKey: queryKeys.jobAnnotations("job_1"),
		})
	})

	it("does not invalidate for stages that were already done", () => {
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(
			qc,
			"job_1",
			build("done", "done", "done"),
			build("done", "done", "done"),
		)
		expect(spy).not.toHaveBeenCalled()
	})

	it("does not invalidate for non-done transitions", () => {
		// e.g. not_started → generating should not trigger invalidation
		const qc = new QueryClient()
		const spy = vi.spyOn(qc, "invalidateQueries")
		invalidateOnStageTransitions(
			qc,
			"job_1",
			build("not_started", "not_started", "not_started"),
			build("generating", "not_started", "not_started"),
		)
		expect(spy).not.toHaveBeenCalled()
	})
})
