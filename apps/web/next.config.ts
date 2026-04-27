import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	// @react-pdf/renderer ships its own pre-bundled vendor (pdfkit, fontkit) and
	// uses ESM/CJS conditional exports that esbuild gets wrong when bundling for
	// Lambda. Keep both packages out of the server bundle.
	serverExternalPackages: ["@react-pdf/renderer", "pdf-lib"],
}

export default nextConfig
