import { spawnSync } from "node:child_process";
import { configureCloudflare } from "./configure-cloudflare.mjs";

// Validate account settings before building or contacting a remote database.
await configureCloudflare();
const env = { ...process.env, CF_CONFIG_PATH: "wrangler.production.json" };
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("node_modules/vinext/dist/cli.js", ["build"]);
run("node_modules/wrangler/bin/wrangler.js", ["d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.production.json"]);
// Vite's generated .wrangler/deploy/config.json selects the built Worker.
run("node_modules/wrangler/bin/wrangler.js", ["deploy"]);
