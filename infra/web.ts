import { auth } from "./api"
import { scansBucket } from "./storage"
import { ocrQueue, extractionQueue } from "./queues"

export const web = new sst.aws.Nextjs("Web", {
	path: "apps/web",
	link: [auth, scansBucket, ocrQueue, extractionQueue],
})
