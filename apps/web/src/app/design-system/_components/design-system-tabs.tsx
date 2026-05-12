"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import type { ReactNode } from "react"

const TAB_VALUES = ["system", "tokens"] as const
type TabValue = (typeof TAB_VALUES)[number]

type Props = {
	systemTab: ReactNode
	tokensTab: ReactNode
}

export function DesignSystemTabs({ systemTab, tokensTab }: Props) {
	const [tab, setTab] = useQueryState<TabValue>(
		"tab",
		parseAsStringLiteral(TAB_VALUES).withDefault("system"),
	)

	return (
		<Tabs
			value={tab}
			onValueChange={(value) => setTab(value as TabValue)}
			className="w-full"
		>
			<TabsList variant="line" className="mb-10 h-10">
				<TabsTrigger value="system" className="px-4">
					Design System
				</TabsTrigger>
				<TabsTrigger value="tokens" className="px-4">
					Tokens
				</TabsTrigger>
			</TabsList>

			<TabsContent value="system">{systemTab}</TabsContent>
			<TabsContent value="tokens">{tokensTab}</TabsContent>
		</Tabs>
	)
}
