import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function deploymentConfig(template, values) {
  const requireValue = (name, pattern) => {
    const value = values[name]?.trim();
    if (!value || !pattern.test(value)) throw new Error(`Set a valid ${name} before deployment.`);
    return value;
  };
  const account = requireValue("CLOUDFLARE_ACCOUNT_ID", /^[a-f0-9]{32}$/i);
  const database = requireValue("D1_DATABASE_ID", /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  if (database === template.d1_databases[0].database_id || /^0{8}-/.test(database)) {
    throw new Error("D1_DATABASE_ID must identify your own database, not the local placeholder.");
  }
  const audience = requireValue("CF_ACCESS_AUD", /^[a-f0-9]{64}$/i);
  const rawDomain = requireValue("CF_ACCESS_TEAM_DOMAIN", /\S+/);
  let domain;
  try { domain = new URL(rawDomain.startsWith("https://") ? rawDomain : `https://${rawDomain}`); }
  catch { throw new Error("CF_ACCESS_TEAM_DOMAIN must be your Cloudflare Access team domain."); }
  if (domain.protocol !== "https:" || domain.port || domain.username || domain.password ||
      domain.pathname !== "/" || domain.search || domain.hash ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(domain.hostname)) {
    throw new Error("CF_ACCESS_TEAM_DOMAIN must be an HTTPS Cloudflare Access team origin.");
  }
  const name = values.CLOUDFLARE_WORKER_NAME?.trim() || "delivery-desk";
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error("Invalid CLOUDFLARE_WORKER_NAME.");
  const environment = values.APP_ENV?.trim() || "Production";
  if (!["Production", "UAT"].includes(environment)) throw new Error("APP_ENV must be Production or UAT.");
  return {
    ...template,
    name,
    account_id: account,
    d1_databases: template.d1_databases.map(binding => ({ ...binding, database_id: database })),
    vars: { APP_ENV: environment, CF_ACCESS_TEAM_DOMAIN: domain.origin, CF_ACCESS_AUD: audience },
  };
}

export async function configureCloudflare(values = process.env) {
  const template = JSON.parse(await readFile("wrangler.json", "utf8"));
  const config = deploymentConfig(template, values);
  await writeFile("wrangler.production.json", JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await configureCloudflare();
  console.log("Cloudflare deployment configuration prepared.");
}
