export type MarkSchemePointInput = {
	description: string
	points: number
}

export type MarkingRulesLevelInput = {
	level: number
	mark_range: [number, number]
	descriptor: string
	ao_requirements?: string[]
}

export type MarkingRulesCapInput = {
	condition: string
	max_level?: number
	max_mark?: number
	reason: string
}

export type MarkingRulesInput = {
	command_word?: string
	items_required?: number
	levels: MarkingRulesLevelInput[]
	caps?: MarkingRulesCapInput[]
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
			marking_rules: MarkingRulesInput
	  }
