export type MarkSchemePointInput = {
	/** What the student must write / say to earn this mark. Domain term: "criteria".
	 *  The grader prompt reads this field exclusively for point-based marking. */
	criteria: string
	/** Optional teacher-authored metadata — a category label, AO code, marker note,
	 *  anything the teacher finds useful. Not read by the grader. Empty string if
	 *  unset. Not produced by PDF extraction or autofill; this is a manual field. */
	description?: string
	points: number
}

export type MarkSchemeInput =
	| {
			marking_method: "point_based"
			description: string
			guidance?: string | null
			mark_points: MarkSchemePointInput[]
	  }
	| {
			marking_method: "deterministic"
			description: string
			guidance?: string | null
			correct_option_labels: string[]
	  }
	| {
			marking_method: "level_of_response"
			description: string
			guidance?: string | null
			content?: string
			points_total?: number
	  }
