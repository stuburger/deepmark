"use client"

import { useTransition } from "react"

import type { Currency } from "@/lib/billing/types"

import { setCurrency } from "../_lib/set-currency"

type Props = {
	current: Currency
}

const OPTIONS: { value: Currency; label: string }[] = [
	{ value: "gbp", label: "GBP £" },
	{ value: "usd", label: "USD $" },
]

export function CurrencySwitcher({ current }: Props) {
	const [pending, startTransition] = useTransition()

	function choose(currency: Currency) {
		if (currency === current || pending) return
		startTransition(async () => {
			await setCurrency({ currency })
		})
	}

	return (
		<div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 text-xs">
			{OPTIONS.map((opt) => {
				const selected = opt.value === current
				return (
					<button
						key={opt.value}
						type="button"
						onClick={() => choose(opt.value)}
						disabled={pending}
						className={`rounded-full px-3 py-1 font-medium transition-colors ${
							selected
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{opt.label}
					</button>
				)
			})}
		</div>
	)
}
