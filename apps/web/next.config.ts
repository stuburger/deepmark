import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	pageExtensions: ["ts", "tsx", "mdx"],
	// Workspace packages compiled inline by Next so its module tracer follows
	// every transitive runtime dep into the Lambda bundle. `@mcp-gcse/emails`
	// imports `@react-email/components` + `@react-email/render` from inside a
	// pre-built `dist/index.js`, and OpenNext's tracer can miss deps reached
	// via a workspace package's compiled output.
	transpilePackages: ["@mcp-gcse/emails"],
	// @react-pdf/renderer ships its own pre-bundled vendor (pdfkit, fontkit) and
	// uses ESM/CJS conditional exports that esbuild gets wrong when bundling for
	// Lambda. Keep both packages out of the server bundle.
	serverExternalPackages: ["@react-pdf/renderer", "pdf-lib"],
}

const withMDX = createMDX({
	// Plugins must be passed as [name, options] tuples (not as imported
	// functions) so Next can serialize the MDX loader's options for its
	// build cache. See: https://github.com/vercel/next.js/issues/53136
	options: {
		remarkPlugins: [["remark-gfm", {}]],
	},
})

export default withMDX(nextConfig)
