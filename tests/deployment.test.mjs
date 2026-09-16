import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deploymentConfig } from "../scripts/configure-cloudflare.mjs";

const template = JSON.parse(await readFile(new URL("../wrangler.json", import.meta.url), "utf8"));
const settings = {
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
  CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  CF_ACCESS_AUD: "b".repeat(64),
};

test("deployment uses configured account, database and Access audience without changing the public template", () => {
  const config = deploymentConfig(template, settings);
  assert.equal(config.account_id, settings.CLOUDFLARE_ACCOUNT_ID);
  assert.equal(config.d1_databases[0].database_id, settings.D1_DATABASE_ID);
  assert.equal(config.d1_databases[0].migrations_dir, "drizzle");
  assert.equal(config.vars.CF_ACCESS_TEAM_DOMAIN, "https://example.cloudflareaccess.com");
  assert.equal(config.vars.CF_ACCESS_AUD, settings.CF_ACCESS_AUD);
  assert.equal(template.d1_databases[0].database_id, "00000000-0000-4000-8000-000000000000");
  assert.equal(template.vars.CF_ACCESS_AUD, "");
});

test("deployment rejects missing account settings and local database placeholders", () => {
  for (const key of Object.keys(settings)) {
    assert.throws(() => deploymentConfig(template, { ...settings, [key]: "" }));
  }
  assert.throws(() => deploymentConfig(template, { ...settings, D1_DATABASE_ID: template.d1_databases[0].database_id }));
});

test("deployment rejects foreign or malformed identity origins", () => {
  for (const domain of ["https://example.com", "http://example.cloudflareaccess.com", "example.cloudflareaccess.com.evil.test", "https://example.cloudflareaccess.com/path", "https://user@example.cloudflareaccess.com", "https://example.cloudflareaccess.com:8443", "https://example.cloudflareaccess.com?x=1"]) {
    assert.throws(() => deploymentConfig(template, { ...settings, CF_ACCESS_TEAM_DOMAIN: domain }));
  }
});

test("UAT deployment has an explicit name and environment and rejects invalid target names", () => {
  const config = deploymentConfig(template, { ...settings, APP_ENV: "UAT", CLOUDFLARE_WORKER_NAME: "delivery-desk-uat" });
  assert.equal(config.name, "delivery-desk-uat");
  assert.equal(config.vars.APP_ENV, "UAT");
  assert.throws(() => deploymentConfig(template, { ...settings, CLOUDFLARE_WORKER_NAME: "../other" }));
  assert.throws(() => deploymentConfig(template, { ...settings, APP_ENV: "Unknown" }));
});
