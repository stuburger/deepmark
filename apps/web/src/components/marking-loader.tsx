/**
 * Three overlapping morphing blobs in primary brand colours. Each blob has its
 * own animation duration so the silhouette never settles into a stable shape —
 * the result feels gooey rather than mechanical. `mix-blend-mode: multiply`
 * lets the colours bleed into a soft purple where they overlap.
 *
 * The label distinguishes user-facing state: "Loading" while the local doc /
 * collab provider syncs, "Marking" once we're waiting on the server-side
 * pipeline (OCR + grading) to project the question skeleton.
 */
export function OrganicMarkingLoader({
	label = "Marking",
}: {
	label?: string
}) {
	return (
		<div className="flex flex-col items-center gap-4">
			<svg
				aria-hidden="true"
				viewBox="0 0 200 200"
				className="h-32 w-32"
				style={{ overflow: "visible" }}
			>
				<title>{label}</title>
				<g style={{ mixBlendMode: "multiply" }}>
					<path fill="rgb(96 165 250 / 0.85)">
						<animate
							attributeName="d"
							dur="6s"
							repeatCount="indefinite"
							values="
								M100,40 C140,40 160,70 160,100 C160,140 130,160 100,160 C60,160 40,130 40,100 C40,70 60,40 100,40 Z;
								M100,30 C150,45 170,75 155,110 C145,150 110,170 80,155 C40,140 30,100 50,70 C65,45 80,30 100,30 Z;
								M100,40 C140,40 160,70 160,100 C160,140 130,160 100,160 C60,160 40,130 40,100 C40,70 60,40 100,40 Z"
						/>
					</path>
					<path fill="rgb(244 114 182 / 0.75)">
						<animate
							attributeName="d"
							dur="7.5s"
							repeatCount="indefinite"
							values="
								M105,55 C140,60 155,90 145,120 C135,150 100,160 75,145 C45,130 50,95 65,70 C75,55 90,52 105,55 Z;
								M95,50 C130,50 165,80 150,115 C135,155 95,165 65,150 C40,135 45,90 65,70 C75,55 80,50 95,50 Z;
								M105,55 C140,60 155,90 145,120 C135,150 100,160 75,145 C45,130 50,95 65,70 C75,55 90,52 105,55 Z"
						/>
					</path>
					<path fill="rgb(251 191 36 / 0.7)">
						<animate
							attributeName="d"
							dur="9s"
							repeatCount="indefinite"
							values="
								M95,60 C125,55 155,80 150,115 C145,145 115,160 85,150 C55,140 50,105 60,80 C70,65 80,60 95,60 Z;
								M105,65 C140,75 150,105 140,135 C125,160 90,160 70,140 C45,120 50,85 70,70 C85,60 95,62 105,65 Z;
								M95,60 C125,55 155,80 150,115 C145,145 115,160 85,150 C55,140 50,105 60,80 C70,65 80,60 95,60 Z"
						/>
					</path>
				</g>
			</svg>
			<span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
				{label}
			</span>
		</div>
	)
}
