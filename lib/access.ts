import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessEnvironment = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
};

export type AccessUser = {
  userId: string;
  displayName: string;
  email: string;
};

export class AccessConfigurationError extends Error {
  constructor() {
    super("Cloudflare Access configuration is missing or invalid.");
    this.name = "AccessConfigurationError";
  }
}

const remoteKeys = new Map<string, JWTVerifyGetKey>();

function configuration(environment: AccessEnvironment) {
  const domain = environment.CF_ACCESS_TEAM_DOMAIN;
  const audience = environment.CF_ACCESS_AUD;
  // Only the explicitly configured Access team may supply signing keys.
  // Never discover a JWKS URL from the token, headers, or query parameters.
  if (
    typeof domain !== "string" ||
    !/^(?:https:\/\/)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com\/?$/.test(domain) ||
    typeof audience !== "string" ||
    audience.length === 0 ||
    audience.length > 512 ||
    /\s/.test(audience)
  ) throw new AccessConfigurationError();
  const issuer = new URL(domain.startsWith("https://") ? domain : `https://${domain}`).origin;
  return { issuer, audience };
}

function signingKeys(issuer: string): JWTVerifyGetKey {
  let keys = remoteKeys.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    remoteKeys.set(issuer, keys);
  }
  return keys;
}

/**
 * Verify a human Cloudflare Access application token before constructing identity.
 * The optional key resolver supports deterministic cryptographic unit tests only;
 * the server wrapper always uses the configured team's remote JWKS.
 */
export async function authenticateAccess(
  requestHeaders: Pick<Headers, "get">,
  environment: AccessEnvironment,
  keyResolver?: JWTVerifyGetKey,
): Promise<AccessUser | null> {
  const { issuer, audience } = configuration(environment);
  const token = requestHeaders.get("cf-access-jwt-assertion");
  if (!token || token.length > 16384) return null;

  try {
    const { payload } = await jwtVerify(token, keyResolver ?? signingKeys(issuer), {
      algorithms: ["RS256"],
      issuer,
      audience,
      requiredClaims: ["iss", "aud", "exp", "iat", "sub", "email", "type"],
    });
    const { sub, email, iat, exp } = payload;
    if (
      payload.type !== "app" ||
      typeof sub !== "string" || sub.trim().length === 0 || sub.length > 512 ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof iat !== "number" || !Number.isFinite(iat) || iat > Date.now() / 1000 + 30 ||
      typeof exp !== "number" || !Number.isFinite(exp) || exp <= iat
    ) return null;

    return {
      // Email is display data; subject + issuer defines ownership across tokens.
      userId: `cloudflare-access:${encodeURIComponent(issuer)}:${encodeURIComponent(sub)}`,
      displayName: email,
      email,
    };
  } catch {
    // Includes bad signatures/claims and unavailable signing keys. Fail closed.
    return null;
  }
}
