import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { CreateQuestionSchema } from "./schema"
import { service } from "./service"

export const handler = tool(CreateQuestionSchema, async (args, extra) => {
	const result = await service(args, extra.authInfo.extra)

	// Format the object response into a string for the MCP tool
	let questionTypeInfo = `
📝 Question Type: ${result.question_type}`

	if (
		result.question_type === "multiple_choice" &&
		result.multiple_choice_options
	) {
		questionTypeInfo += `
🔤 Multiple Choice Options: ${result.multiple_choice_options.length} (${result.multiple_choice_options.map((opt) => opt.option_label).join(", ")})
💡 Note: Correct answers should be defined in the mark scheme`
	}

	let examSectionInfo = ""
	if (result.exam_section_info) {
		examSectionInfo = `

✅ Question added to exam paper: ${result.exam_section_info.exam_paper_title}
📋 Section: ${result.exam_section_info.section_title}
📍 Question order in section: ${result.exam_section_info.question_order}`
	}

	return `
Question created successfully! 
Question ID: ${result.question.id}
Created by: ${result.question.created_by.name} (${result.question.created_by.email || "No email"})${questionTypeInfo}${examSectionInfo}
`
})
