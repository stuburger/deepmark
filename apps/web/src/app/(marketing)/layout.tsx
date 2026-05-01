import { MarketingFooter } from "./_components/marketing-footer"
import { MarketingNav } from "./_components/marketing-nav"

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<MarketingNav />
			<main className="flex-1">{children}</main>
			<MarketingFooter />
		</div>
	)
}
