import * as path from "node:path"
import type { SegmentationFixture } from "./y10-scanpaper-1"

/**
 * gwaugh-700-page — 700-page production batch from 2026-05-06
 * (`cmotv3srp000002judhg0sq7e`). Segmentation completed in 15.9 s and
 * produced 25 scripts — the easy-case counterpoint to the
 * `geoff-business-y9-214` fixture, which fails on the same call site
 * with denser content but a third the page count.
 *
 * Lives in `y10_papers/gwaugh-700-page.pdf` (44 MB, gitignored — see
 * .gitignore for re-fetch instructions). The eval skips this fixture
 * gracefully when the file isn't on disk.
 *
 * Structural-only ground truth: this fixture exists primarily as a
 * regression guard so any future "fix" to the segmentation prompt /
 * timeout / model that breaks the cheap, fast case fails loudly. Use
 * the same hand-label workflow as geoff-business-y9-214 if you want
 * to ratchet name/start-page hits later.
 */
export const GWAUGH_700_PAGE_FIXTURE: SegmentationFixture = {
	name: "gwaugh-700-page",
	pdfPath: path.resolve(
		__dirname,
		"../../../../../../y10_papers/gwaugh-700-page.pdf",
	),
	totalPages: 700,
	scripts: [],
	thresholds: {
		minStartPageHits: 0,
		minNameHits: 0,
		scriptCountTolerance: 999,
	},
}
