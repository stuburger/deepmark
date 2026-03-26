// Stage configuration for multi-environment deployments
export const _PRODUCTION_ = $app.stage === "production"
export const _DEVELOPMENT_ = $app.stage === "development"

// Permanent stages are production and development
// PR preview stages are ephemeral (pr-123-feature-name)
export const isPermanentStage = ["development", "production"].includes(
	$app.stage,
)

// Single Route53 hosted zone for getdeepmark.com
// TODO: Set this to the actual Route53 hosted zone ID after domain setup
export const HOSTED_ZONE_ID = "Z0948185177S09YB0TEHQ"

// Domain configuration — single zone, subdomain per stage
// Production: getdeepmark.com
// Development: dev.getdeepmark.com
// PR stages: pr-123.dev.getdeepmark.com (subdomain of dev, shares dev Router)
export const baseDomain = "getdeepmark.com"
export const hostedZoneId = HOSTED_ZONE_ID

export const domain = _PRODUCTION_
	? baseDomain
	: _DEVELOPMENT_
		? `dev.${baseDomain}`
		: `${$app.stage}.dev.${baseDomain}`

/**
 * Helper function for creating subdomains
 *
 * CloudFront doesn't support nested wildcards (*.*.example.com)
 * So for PR stages, we use hyphens instead of dots:
 * - Permanent stages: auth.getdeepmark.com, auth.dev.getdeepmark.com
 * - PR stages: auth-pr-123.dev.getdeepmark.com (under dev to share Router)
 */
export function subdomain(name: string): string {
	if (isPermanentStage) {
		return `${name}.${domain}`
	}
	return `${name}-${$app.stage}.dev.${baseDomain}`
}

export const webUrl = $dev ? "http://localhost:3000" : `https://${domain}`

// Shared secrets used by API handlers and background processors.
export const geminiApiKey = new sst.Secret("GeminiApiKey")
export const cloudVisionApiKey = new sst.Secret("CloudVisionApiKey")
/** Reserved for future OpenAI use; app code currently uses Gemini only. */
export const openAiApiKey = new sst.Secret("OpenAiApiKey")

// OAuth provider credentials used by the auth issuer.
export const githubClientId = new sst.Secret("GithubClientId")
export const githubClientSecret = new sst.Secret("GithubClientSecret")
export const googleClientId = new sst.Secret("GoogleClientId")
export const googleClientSecret = new sst.Secret("GoogleClientSecret")
