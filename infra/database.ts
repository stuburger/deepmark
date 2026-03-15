import { _PRODUCTION_ } from "./config";

/**
 * Neon Database Configuration with Branching Strategy
 *
 * Strategy:
 * - Single Neon project for all stages
 * - Production uses the main branch directly (project.connectionUri)
 * - Development and PR previews create/use named branches
 *
 * This allows:
 * - Cost efficiency (single project)
 * - Data isolation between stages
 * - Easy cleanup of PR branches when PRs are closed
 */

const projectId = process.env.NEON_PROJECT_ID!;

// Data source — reliably returns credentials and connection info without
// importing the project into Pulumi state (avoids Project.get() API read failures)
const projectData = neon.getProjectOutput({ id: projectId });

// For non-production stages, create a branch
// Production uses the main branch directly
const branch = !_PRODUCTION_
  ? new neon.Branch("NeonBranch", {
      projectId,
      name: $app.stage,
    })
  : undefined;

// Create an endpoint for the branch (non-production only)
export const branchEndpoint = branch
  ? new neon.Endpoint("NeonBranchEndpoint", {
      projectId,
      branchId: branch.id,
    })
  : undefined;

// Build the database URL based on stage.
// Uses the project's default role (neondb_owner) which owns the public schema.
export const databaseUrl = _PRODUCTION_
  ? projectData.connectionUri
  : branchEndpoint
  ? $interpolate`postgresql://${projectData.databaseUser}:${projectData.databasePassword}@${branchEndpoint.host}/neondb?sslmode=require`
  : (() => {
      throw new Error("Non-production Neon branch endpoint was not created.");
    })();

// Linkable for other resources to connect to Neon
export const neonPostgres = new sst.Linkable("NeonPostgres", {
  properties: {
    databaseUrl,
  },
});
