import { Font, StyleSheet } from "@react-pdf/renderer"

// Handwriting font used for student answer text, matching the single-student
// jsPDF export. Register once at module load — idempotent on subsequent imports.
export const HANDWRITING_FONT = "Indie Flower"

Font.register({
	family: HANDWRITING_FONT,
	src: "https://fonts.gstatic.com/s/indieflower/v21/m8JVjfNVeKWVnh3QMuKkFcZlbkGG1dKEDw.ttf",
})

export const colors = {
	text: "#111827",
	muted: "#6B7280",
	mutedLight: "#9CA3AF",
	border: "#E5E7EB",
	borderStrong: "#D1D5DB",
	answerBg: "#F9FAFB",
	good: "#16A34A",
	warn: "#CA8A04",
	bad: "#DC2626",
	primary: "#111827",
} as const

export const styles = StyleSheet.create({
	page: {
		paddingTop: 40,
		paddingBottom: 40,
		paddingHorizontal: 44,
		fontSize: 10,
		fontFamily: "Helvetica",
		color: colors.text,
		lineHeight: 1.35,
	},
	h1: {
		fontSize: 20,
		fontFamily: "Helvetica-Bold",
		lineHeight: 1.15,
		marginBottom: 8,
	},
	h2: {
		fontSize: 14,
		fontFamily: "Helvetica-Bold",
		lineHeight: 1.2,
		marginBottom: 4,
	},
	h3: {
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		marginBottom: 3,
	},
	muted: {
		color: colors.muted,
	},
	smallMuted: {
		fontSize: 9,
		color: colors.muted,
	},
	rule: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: 8,
	},
	row: {
		flexDirection: "row",
	},
	spaceBetween: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	metaLine: {
		flexDirection: "row",
		gap: 12,
		marginTop: 3,
		color: colors.muted,
		fontSize: 9,
	},

	// Summary table on cover page
	tableHeader: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderStrong,
		paddingBottom: 4,
		marginTop: 8,
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
		color: colors.muted,
	},
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: colors.border,
		paddingVertical: 5,
		fontSize: 10,
	},
	colStudent: {
		flex: 2,
	},
	colMarks: {
		width: 60,
		textAlign: "right",
	},
	colPercent: {
		width: 50,
		textAlign: "right",
	},
	colGrade: {
		width: 50,
		textAlign: "right",
	},

	// Per-question card
	questionCard: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 4,
		padding: 10,
		marginBottom: 8,
	},
	questionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 4,
	},
	questionNumber: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11,
	},
	questionScore: {
		fontFamily: "Helvetica-Bold",
		fontSize: 11,
	},
	questionText: {
		fontSize: 9,
		color: colors.muted,
		marginBottom: 6,
	},
	// Stimulus / case-study block rendered above the question text
	stimulusBox: {
		backgroundColor: "#FFFBEB", // amber-50
		borderLeftWidth: 2,
		borderLeftColor: "#F59E0B", // amber-500
		paddingVertical: 5,
		paddingHorizontal: 8,
		marginBottom: 6,
	},
	stimulusLabel: {
		fontSize: 8,
		fontFamily: "Helvetica-Bold",
		color: "#92400E", // amber-900
		marginBottom: 2,
	},
	stimulusContent: {
		fontSize: 8,
		color: "#78350F", // amber-950-ish
		lineHeight: 1.3,
	},
	answerBox: {
		backgroundColor: colors.answerBg,
		borderWidth: 0.5,
		borderColor: colors.border,
		borderRadius: 3,
		padding: 8,
	},
	// Handwriting styling lives on the Text because @react-pdf does not
	// inherit font styles from a parent View.
	answerText: {
		fontFamily: HANDWRITING_FONT,
		fontSize: 12,
		lineHeight: 1.3,
	},
	bulletHeading: {
		marginTop: 6,
		marginBottom: 2,
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
	},
	bullet: {
		fontSize: 9,
		marginLeft: 8,
	},

	// MCQ table on student section
	mcqHeader: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: colors.borderStrong,
		paddingBottom: 3,
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
		color: colors.muted,
	},
	mcqRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: colors.border,
		paddingVertical: 3,
		fontSize: 9,
	},
	mcqColQ: { width: 40 },
	mcqColCorrect: { width: 80 },
	mcqColStudent: { flex: 1 },
	mcqColMark: { width: 50, textAlign: "right" },

	// Footer
	footer: {
		position: "absolute",
		bottom: 20,
		left: 44,
		right: 44,
		flexDirection: "row",
		justifyContent: "space-between",
		fontSize: 8,
		color: colors.mutedLight,
	},
})
