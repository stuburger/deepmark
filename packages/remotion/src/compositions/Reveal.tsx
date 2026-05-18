import { AbsoluteFill, Sequence } from "remotion"
import type { Fixture } from "../data/types"
import { INTRO_DURATION, IntroCard } from "./IntroCard"
import { OUTRO_DURATION, OutroCard } from "./OutroCard"
import { PageSceneComp, getPageSceneDuration } from "./PageScene"
import { tokens } from "./tokens"

type Props = {
	fixture: Fixture
}

export function getRevealDuration(fixture: Fixture, _fps: number) {
	const sceneFrames = fixture.scenes
		.map(getPageSceneDuration)
		.reduce((a, b) => a + b, 0)
	return INTRO_DURATION + sceneFrames + OUTRO_DURATION
}

export function Reveal({ fixture }: Props) {
	const sceneOffsets: { from: number; duration: number }[] = []
	let offset = INTRO_DURATION
	for (const scene of fixture.scenes) {
		const duration = getPageSceneDuration(scene)
		sceneOffsets.push({ from: offset, duration })
		offset += duration
	}
	const outroFrom = offset

	return (
		<AbsoluteFill style={{ background: tokens.paper }}>
			<Sequence from={0} durationInFrames={INTRO_DURATION} layout="none">
				<IntroCard
					studentName={fixture.studentName}
					paperTitle={fixture.paperTitle}
					awarded={fixture.totalAwarded}
					max={fixture.totalMax}
				/>
			</Sequence>
			{fixture.scenes.map((scene, idx) => (
				<Sequence
					key={idx}
					from={sceneOffsets[idx].from}
					durationInFrames={sceneOffsets[idx].duration}
					layout="none"
				>
					<PageSceneComp scene={scene} />
				</Sequence>
			))}
			<Sequence
				from={outroFrom}
				durationInFrames={OUTRO_DURATION}
				layout="none"
			>
				<OutroCard awarded={fixture.totalAwarded} max={fixture.totalMax} />
			</Sequence>
		</AbsoluteFill>
	)
}
