import { SettingsTabs } from "./settings-tabs"

export default function SettingsLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="pt-8 pb-12">
			<div className="mx-auto mb-2 max-w-2xl px-2">
				<h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
			</div>
			<SettingsTabs />
			<div className="mx-auto max-w-2xl px-2 pt-8">{children}</div>
		</div>
	)
}
