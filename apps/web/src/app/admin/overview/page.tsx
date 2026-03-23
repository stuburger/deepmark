import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { getDashboardData } from "@/lib/dashboard-actions"
import {
	BookOpen,
	CheckCircle2,
	Clock,
	FileText,
	Library,
	Link2Off,
	Users,
	XCircle,
} from "lucide-react"
import { MarkingStatusChart } from "./_components/marking-status-chart"
import { QuestionsBySubjectChart } from "./_components/questions-by-subject-chart"

export default async function AdminOverviewPage() {
	const data = await getDashboardData()
	const { stats } = data

	const statCards = [
		{
			title: "Total Users",
			value: stats.totalUsers,
			description: "Registered accounts",
			icon: Users,
			color: "text-blue-500",
		},
		{
			title: "Questions",
			value: stats.totalQuestions,
			description: "Active questions",
			icon: BookOpen,
			color: "text-purple-500",
		},
		{
			title: "Exam Papers",
			value: stats.totalExamPapers,
			description: "Active exam papers",
			icon: FileText,
			color: "text-orange-500",
		},
		{
			title: "Question Banks",
			value: stats.totalQuestionBanks,
			description: "Active question banks",
			icon: Library,
			color: "text-teal-500",
		},
		{
			title: "Pending Marking",
			value: stats.pendingAnswers,
			description: `${stats.completedAnswers} completed · ${stats.failedAnswers} failed`,
			icon: Clock,
			color: "text-yellow-500",
		},
		{
			title: "Student paper jobs",
			value: stats.totalStudentPaperJobs,
			description: `${stats.activeStudentPaperJobs} in progress (not yet finished)`,
			icon: FileText,
			color: "text-pink-500",
		},
		{
			title: "Link Review",
			value: stats.markSchemesNeedingReview,
			description: "Mark schemes auto-linked or unlinked",
			icon: Link2Off,
			color: "text-amber-500",
		},
	]

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Admin Overview
				</h1>
				<p className="text-sm text-muted-foreground">
					Overview of exam data, marking activity, and student paper uploads.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{statCards.map(({ title, value, description, icon: Icon, color }) => (
					<Card key={title}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">{title}</CardTitle>
							<Icon className={`h-4 w-4 ${color}`} />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{value.toLocaleString()}</div>
							<p className="text-xs text-muted-foreground">{description}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Marking Status</CardTitle>
						<CardDescription>
							Breakdown of all submitted answers by marking state
						</CardDescription>
					</CardHeader>
					<CardContent>
						<MarkingStatusChart data={data.markingStatusBreakdown} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Questions by Subject</CardTitle>
						<CardDescription>
							Number of questions available per subject
						</CardDescription>
					</CardHeader>
					<CardContent>
						<QuestionsBySubjectChart data={data.questionsBySubject} />
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Users by Role</CardTitle>
						<CardDescription>
							Distribution of user roles across the platform
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{data.usersByRole.length === 0 ? (
								<p className="text-sm text-muted-foreground">No users yet</p>
							) : (
								data.usersByRole.map(({ role, count }) => (
									<div
										key={role}
										className="flex items-center justify-between py-1"
									>
										<span className="text-sm capitalize">{role}</span>
										<Badge variant="secondary">{count}</Badge>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Marking Summary</CardTitle>
						<CardDescription>
							Answer marking totals across all sessions
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between py-1">
								<span className="flex items-center gap-2 text-sm">
									<Clock className="h-4 w-4 text-yellow-500" />
									Pending
								</span>
								<Badge variant="outline">
									{stats.pendingAnswers.toLocaleString()}
								</Badge>
							</div>
							<div className="flex items-center justify-between py-1">
								<span className="flex items-center gap-2 text-sm">
									<CheckCircle2 className="h-4 w-4 text-green-500" />
									Completed
								</span>
								<Badge variant="outline">
									{stats.completedAnswers.toLocaleString()}
								</Badge>
							</div>
							<div className="flex items-center justify-between py-1">
								<span className="flex items-center gap-2 text-sm">
									<XCircle className="h-4 w-4 text-destructive" />
									Failed
								</span>
								<Badge variant="outline">
									{stats.failedAnswers.toLocaleString()}
								</Badge>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
