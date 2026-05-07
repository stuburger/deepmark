import puppeteer, { type Browser } from "puppeteer-core"

/**
 * Module-scoped browser cache. Reusing the browser across invocations on a
 * warm Lambda saves the ~1.5 s chromium boot. The cache is a Promise so
 * concurrent invocations on the same warm container share one browser
 * instead of racing to launch their own.
 *
 * Health check on read: a Chromium that died mid-render (page.pdf hung
 * past timeout, runtime crashed, /tmp filled up) leaves a Browser handle
 * that's no longer connected. Without the `connected` check, every
 * subsequent invocation on the warm container fails identically until
 * the container recycles. With it, we drop the dead handle, re-launch,
 * and only the first invocation pays the cold start.
 */
let browserPromise: Promise<Browser> | null = null

export async function getBrowser(): Promise<Browser> {
	if (browserPromise) {
		try {
			const cached = await browserPromise
			if (cached.connected) return cached
		} catch {
			// Previous launch rejected; the catch handler below already
			// cleared the cache, but we may have been re-entered before
			// that happened. Fall through to relaunch either way.
		}
		browserPromise = null
	}
	browserPromise = launchBrowser()
	// If the launch fails, clear the cache so the next invocation can retry
	// instead of being permanently stuck with a rejected promise.
	browserPromise.catch(() => {
		browserPromise = null
	})
	return browserPromise
}

/**
 * `sst dev` sets `AWS_LAMBDA_FUNCTION_NAME` on the local process so the AWS
 * SDK behaves the same as in real Lambda. That makes it useless as a
 * "really running in AWS" signal — `LAMBDA_TASK_ROOT` is the canonical
 * env var the AWS Lambda runtime sets and SST does not.
 */
function isRealLambda(): boolean {
	return !!process.env.LAMBDA_TASK_ROOT
}

async function launchBrowser(): Promise<Browser> {
	if (isRealLambda()) {
		// Dynamic import keeps `@sparticuz/chromium` (and its 50 MB binary
		// tarball) out of the local `sst dev` codepath, where it would crash
		// at import time because esbuild relocates the package's bin/.
		const { default: chromium } = await import("@sparticuz/chromium")
		return puppeteer.launch({
			args: chromium.args,
			executablePath: await chromium.executablePath(),
			headless: true,
			defaultViewport: { width: 1240, height: 1754 },
		})
	}
	// Local `sst dev`: puppeteer-core has no bundled binary, so point at a
	// system Chrome. Override with PUPPETEER_EXECUTABLE_PATH for non-macOS
	// dev boxes or custom installs.
	const executablePath =
		process.env.PUPPETEER_EXECUTABLE_PATH ??
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
	return puppeteer.launch({
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		executablePath,
		headless: true,
		defaultViewport: { width: 1240, height: 1754 },
	})
}
