export const _PRODUCTION_ = $app.stage === "production"

// Shared secrets used by API handlers and background processors.
export const geminiApiKey = new sst.Secret("GeminiApiKey")
/** Reserved for future OpenAI use; app code currently uses Gemini only. */
export const openAiApiKey = new sst.Secret("OpenAiApiKey")

// OAuth provider credentials used by the auth issuer.
export const githubClientId = new sst.Secret("GithubClientId")
export const githubClientSecret = new sst.Secret("GithubClientSecret")
export const googleClientId = new sst.Secret("GoogleClientId")
export const googleClientSecret = new sst.Secret("GoogleClientSecret")
