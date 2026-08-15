import "dotenv/config";
import { describeDriver } from "../src/db";
import { applyMigrations } from "../src/db/migrate";

async function main() {
  console.log(`→ driver: ${describeDriver()}`);
  await applyMigrations();
  console.log("✓ schema migrations applied");
  console.log("✓ row-level security policies applied");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ migration failed");
  console.error(err);
  process.exit(1);
});
