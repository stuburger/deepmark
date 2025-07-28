import { initializeIndexes } from "./init-indexes";
import { runMigrationToRemoveExamPaperAssociations } from "./migration-utils";

/**
 * Complete database setup including migration and index creation
 */
export async function setupDatabase() {
  console.log("🔧 Setting up database...");

  try {
    // Run migration first to remove exam paper associations
    await runMigrationToRemoveExamPaperAssociations();

    // Then create indexes for optimal performance
    await initializeIndexes();

    console.log("✅ Database setup completed successfully!");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    throw error;
  }
}

/**
 * Just initialize indexes (for when data is already migrated)
 */
export async function setupIndexesOnly() {
  console.log("🔧 Setting up database indexes...");

  try {
    await initializeIndexes();
    console.log("✅ Database indexes setup completed successfully!");
  } catch (error) {
    console.error("❌ Database indexes setup failed:", error);
    throw error;
  }
}

/**
 * Just run migration (for when indexes are already set up)
 */
export async function runMigrationOnly() {
  console.log("🔧 Running database migration...");

  try {
    await runMigrationToRemoveExamPaperAssociations();
    console.log("✅ Database migration completed successfully!");
  } catch (error) {
    console.error("❌ Database migration failed:", error);
    throw error;
  }
}
