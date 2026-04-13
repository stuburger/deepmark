export type MarkSchemePointInput = {
	description: string
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
