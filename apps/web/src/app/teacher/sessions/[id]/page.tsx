import { SessionLiveView } from "./session-live-view"

export default async function SessionPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	return (
		<div className="mx-auto w-full max-w-2xl py-12">
			<SessionLiveView sessionId={id} />
		</div>
	)
}
