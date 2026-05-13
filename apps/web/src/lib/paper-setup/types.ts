/**
 * Three labels the smart classifier assigns to a dropped PDF. The drop zone
 * also surfaces `unrecognised` for files the classifier couldn't place — the
 * teacher then drags those into a slot manually.
 */
export type StagedFileLabel =
	| "question_paper"
	| "mark_scheme"
	| "scripts_bundle"
	| "unrecognised"

/** What the user can actually submit — `unrecognised` is excluded. */
export type CommittableStagedFileLabel = Exclude<StagedFileLabel, "unrecognised">

export type ClassifiedStagedFile = {
	tempUploadId: string
	label: StagedFileLabel
	error: string | null
}
