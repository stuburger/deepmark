import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Badge } from "@/components/ui/badge"

const steps = [
	{
		n: "01",
		title: "Upload the question paper and mark scheme",
		body: "Drop in the QP and MS PDFs. DeepMark extracts questions, mark points, level descriptors and caps automatically.",
	},
	{
		n: "02",
		title: "Drop in scanned student scripts",
		body: "One multi-page PDF, many students. Scripts are segmented per pupil — review the splits, then submit for marking.",
	},
	{
		n: "03",
		title: "Open results — review, override, export",
		body: "Marks land per question with examiner rationale. Disagree with a call? Override it. Export the lot when you're done.",
	},
]

export function HowItWorksSection() {
	return (
		<section id="how-it-works" className="border-b border-border/40">
			<div className="mx-auto max-w-6xl px-6 py-24">
				<div className="mx-auto max-w-2xl text-center">
					<h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
						How it works
					</h2>
					<p className="mt-4 text-base text-muted-foreground">
						Three steps from a stack of scripts to a marked, exported set.
					</p>
				</div>
				<div className="mt-14 space-y-16">
					{steps.map((step, i) => (
						<div
							key={step.n}
							className={`grid items-center gap-10 md:grid-cols-2 ${
								i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""
							}`}
						>
							<div>
								<p className="text-sm font-mono text-muted-foreground">
									{step.n}
								</p>
								<h3 className="mt-2 text-2xl font-semibold tracking-tight">
									{step.title}
								</h3>
								<p className="mt-3 text-base text-muted-foreground">
									{step.body}
								</p>
							</div>
							<AspectRatio
								ratio={16 / 10}
								className="overflow-hidden rounded-lg border border-border/60 bg-muted/40"
							>
								<div className="flex h-full items-center justify-center">
									<Badge variant="secondary">Screenshot {step.n}</Badge>
								</div>
							</AspectRatio>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}
