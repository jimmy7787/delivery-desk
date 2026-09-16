import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import ts from "typescript";

await mkdir(".runtime/auth-test", { recursive: true });
await writeFile(".runtime/auth-test/access.mjs", ts.transpileModule(
  await readFile("lib/access.ts", "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
).outputText);
const { authenticateAccess, AccessConfigurationError } = await import("../.runtime/auth-test/access.mjs");

// Fixtures are signed locally. No account, real identity, or network is required.
const { privateKey, publicKey } = await generateKeyPair("RS256");
const attacker = await generateKeyPair("RS256");
const publicJwk = { ...await exportJWK(publicKey), kid: "access-fixture", alg: "RS256", use: "sig" };
const keys = createLocalJWKSet({ keys: [publicJwk] });
const environment = {
  CF_ACCESS_TEAM_DOMAIN: "https://delivery-test.cloudflareaccess.com",
  CF_ACCESS_AUD: "delivery-test-audience",
};
const issuer = environment.CF_ACCESS_TEAM_DOMAIN;
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: issuer, aud: [environment.CF_ACCESS_AUD], sub: "user-alice", email: "alice@example.test",
  type: "app", iat: now - 60, nbf: now - 60, exp: now + 300,
};
const token = (overrides = {}, signingKey = privateKey) => new SignJWT({ ...claims, ...overrides })
  .setProtectedHeader({ alg: "RS256", kid: "access-fixture" }).sign(signingKey);
const headers = (jwt, extra = {}) => new Headers({ ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}), ...extra });
const verify = (jwt, env = environment, extra = {}) => authenticateAccess(headers(jwt, extra), env, keys);

test("a valid signed human application token establishes identity", async () => {
  const user = await verify(await token());
  assert.equal(user.email, "alice@example.test");
  assert.equal(user.displayName, "alice@example.test");
  assert.ok(user.userId.startsWith("cloudflare-access:"));
});

test("bare and HTTPS team configuration normalize to the same identity", async () => {
  const jwt = await token();
  const user = await verify(jwt);
  assert.deepEqual(await verify(jwt, { ...environment, CF_ACCESS_TEAM_DOMAIN: "delivery-test.cloudflareaccess.com" }), user);
  assert.deepEqual(await verify(jwt, { ...environment, CF_ACCESS_TEAM_DOMAIN: issuer + "/" }), user);
});

test("missing or malformed configuration fails closed before key resolution", async () => {
  const jwt = await token();
  for (const env of [
    {}, { CF_ACCESS_TEAM_DOMAIN: issuer }, { CF_ACCESS_AUD: "audience" },
    ...["", "http://delivery-test.cloudflareaccess.com", "https://example.com", "https://cloudflareaccess.com", "https://a.b.cloudflareaccess.com", "https://delivery-test.cloudflareaccess.com.attacker.test", "https://user@delivery-test.cloudflareaccess.com", "https://delivery-test.cloudflareaccess.com:443", "https://delivery-test.cloudflareaccess.com/path", "https://delivery-test.cloudflareaccess.com?redirect=test"].map(domain => ({ ...environment, CF_ACCESS_TEAM_DOMAIN: domain })),
    { ...environment, CF_ACCESS_AUD: "" }, { ...environment, CF_ACCESS_AUD: " " },
  ]) await assert.rejects(verify(jwt, env), AccessConfigurationError);
});

test("expired and not-yet-valid tokens are rejected", async () => {
  assert.equal(await verify(await token({ iat: now - 300, exp: now - 60 })), null);
  assert.equal(await verify(await token({ nbf: now + 300 })), null);
  assert.equal(await verify(await token({ iat: now + 300, exp: now + 600 })), null);
});

test("a different audience or issuer cannot reuse a signed token", async () => {
  assert.equal(await verify(await token({ aud: ["different-app"] })), null);
  assert.equal(await verify(await token({ iss: "https://another-team.cloudflareaccess.com" })), null);
});

test("forged signatures and tampered claims are rejected", async () => {
  assert.equal(await verify(await token({}, attacker.privateKey)), null);
  const parts = (await token()).split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: "user-admin" })).toString("base64url");
  assert.equal(await verify(parts.join(".")), null);
});

test("unsigned and unexpected-algorithm tokens are rejected", async () => {
  const unsigned = [Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url"), ""].join(".");
  assert.equal(await verify(unsigned), null);
  const symmetric = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
  assert.equal(await verify(symmetric), null);
  assert.equal(await verify("malformed-token"), null);
  assert.equal(await verify("a".repeat(16385)), null);
});

test("all security and human-identity claims are required", async () => {
  for (const claim of ["iss", "aud", "exp", "iat", "sub", "email", "type"])
    assert.equal(await verify(await token({ [claim]: undefined })), null, `Missing ${claim} must fail`);
});

test("service tokens, global sessions, and malformed human identities are rejected", async () => {
  for (const override of [
    { sub: "", email: undefined, common_name: "service-token.access" },
    { type: "org" }, { sub: " " }, { sub: 123 }, { email: "not-an-email" }, { email: 123 },
    { iat: now + 10, exp: now + 5 },
  ]) assert.equal(await verify(await token(override)), null);
});

test("spoofed old identity headers, email headers, and cookies grant no access", async () => {
  assert.equal(await verify(undefined, environment, {
    "oai-authenticated-user-id": "admin",
    "oai-authenticated-user-email": "admin@example.test",
    "cf-access-authenticated-user-email": "admin@example.test",
    cookie: `CF_Authorization=${await token()}`,
  }), null);
});

test("signed identity overrides attacker-supplied display and identity headers", async () => {
  const user = await verify(await token(), environment, {
    "oai-authenticated-user-id": "admin",
    "oai-authenticated-user-email": "admin@example.test",
    "cf-access-authenticated-user-email": "admin@example.test",
  });
  assert.equal(user.email, "alice@example.test");
  assert.equal(user.userId, (await verify(await token())).userId);
});

test("ownership uses issuer and subject, not an email address", async () => {
  const alice = await verify(await token());
  const changedEmail = await verify(await token({ email: "changed@example.test" }));
  const anotherSubject = await verify(await token({ sub: "user-bob" }));
  const otherIssuer = "https://another-team.cloudflareaccess.com";
  const anotherTeam = await verify(await token({ iss: otherIssuer }), { ...environment, CF_ACCESS_TEAM_DOMAIN: otherIssuer });
  assert.equal(alice.userId, changedEmail.userId);
  assert.notEqual(alice.userId, anotherSubject.userId);
  assert.notEqual(alice.userId, anotherTeam.userId);
});

test("signing-key lookup failures deny access", async () => {
  assert.equal(await authenticateAccess(headers(await token()), environment, async () => {
    throw new Error("Signing key service unavailable");
  }), null);
});
