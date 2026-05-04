import { cn } from "@/lib/utils"

export function Swatch({
	cssVar,
	name,
	hex,
	usage,
	textOnSwatch = false,
	height = "h-16",
}: {
	/** Token name without `--`, e.g. `color-teal-500` or `success`. */
	cssVar: string
	name: string
	/** Optional hex display under the name. Pulled from the generated CSS. */
	hex?: string
	usage?: string
	/** When the swatch background is the brand teal/green and white text is required. */
	textOnSwatch?: boolean
	height?: string
}) {
	return (
		<div className="rounded-md overflow-hidden shadow-tile-quiet border border-border-subtle bg-card">
			<div
				className={cn(
					height,
					textOnSwatch &&
						"flex items-end p-2 text-[10px] font-mono text-white/85",
				)}
				style={{ backgroundColor: `var(--${cssVar})` }}
			>
				{textOnSwatch && hex}
			</div>
			<div className="px-3 py-2.5">
				<p className="text-[11px] font-semibold text-foreground">{name}</p>
				{hex && !textOnSwatch && (
					<p className="font-mono text-[10px] text-ink-tertiary mt-0.5">
						{hex}
					</p>
				)}
				{usage && (
					<p className="text-[10px] text-ink-tertiary mt-1 leading-snug">
						{usage}
					</p>
				)}
			</div>
		</div>
	)
}

export function ScaleRow({
	name,
	shades,
}: {
	name: string
	shades: { shade: number; hex: string }[]
}) {
	return (
		<div className="mb-5">
			<div className="flex items-baseline justify-between mb-2">
				<p className="text-xs font-semibold text-foreground capitalize">
					{name}
				</p>
				<p className="font-mono text-[10px] text-ink-tertiary">
					{shades.length} shades · anchor-derived
				</p>
			</div>
			<div className="grid grid-cols-11 gap-1.5">
				{shades.map(({ shade, hex }) => (
					<div
						key={shade}
						className="rounded-sm overflow-hidden border border-border-subtle"
					>
						<div
							className="h-12"
							style={{ backgroundColor: `var(--color-${name}-${shade})` }}
						/>
						<div className="bg-card px-1.5 py-1 text-center">
							<p className="font-mono text-[9px] text-foreground tabular-nums">
								{shade}
							</p>
							<p className="font-mono text-[8px] text-ink-tertiary tabular-nums leading-tight">
								{hex}
							</p>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
