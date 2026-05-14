import { Composition } from "remotion";
import { fixture } from "./data/fixture";
import { Reveal, getRevealDuration } from "./compositions/Reveal";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const Root = () => {
	const durationInFrames = getRevealDuration(fixture, FPS);

	return (
		<>
			<Composition
				id="Reveal"
				component={Reveal}
				durationInFrames={durationInFrames}
				fps={FPS}
				width={WIDTH}
				height={HEIGHT}
				defaultProps={{ fixture }}
			/>
		</>
	);
};
