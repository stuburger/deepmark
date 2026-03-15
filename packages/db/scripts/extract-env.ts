// Extracts environment variables from SST resources and writes to an env file.
// Usage: bunx sst shell bun run scripts/extract-env.ts [output-file] --stage=<stage>

import { Resource } from "sst";

const outputFile = process.argv[2] || ".env";

const envVars = {
  DATABASE_URL: Resource.NeonPostgres.databaseUrl,
};

const content =
  Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";

await Bun.write(outputFile, content);

console.log(`✓ Wrote environment variables to ${outputFile}`);
