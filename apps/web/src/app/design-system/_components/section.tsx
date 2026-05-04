import type { ReactNode } from "react"

export function Section({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string
	title: string
	description?: string
	children: ReactNode
}) {
	return (
		<section className="mb-16">
			<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-tertiary mb-1.5">
				{eyebrow}
			</p>
			<h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
				{title}
			</h2>
			{description && (
				<p className="text-sm text-muted-foreground max-w-2xl mb-7 leading-relaxed">
					{description}
				</p>
			)}
			<hr className="border-border-quiet mb-7" />
			{children}
		</section>
	)
}

export function SubsectionTitle({ children }: { children: ReactNode }) {
	return (
		<h3 className="text-xs font-semibold text-foreground mb-3 mt-8 first:mt-0">
			{children}
		</h3>
	)
}

export function IntentBox({
	label,
	children,
}: {
	label: string
	children: ReactNode
}) {
	return (
		<div className="mb-7 rounded-r-md border-l-[3px] border-primary bg-teal-50 px-4 py-3.5">
			<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-teal-700 mb-1.5">
				{label}
			</p>
			<p className="text-[13px] text-muted-foreground leading-relaxed">
				{children}
			</p>
		</div>
	)
}

export function WarnBox({
	label,
	children,
}: {
	label: string
	children: ReactNode
}) {
	return (
		<div className="mb-7 rounded-r-md border-l-[3px] border-warning bg-warning-50 px-4 py-3.5">
			<p className="font-mono text-[9px] uppercase tracking-[0.14em] text-warning-700 mb-1.5">
				{label}
			</p>
			<p className="text-[13px] text-muted-foreground leading-relaxed">
				{children}
			</p>
		</div>
	)
}
