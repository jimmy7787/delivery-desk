import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { authenticateAccess, type AccessUser } from "./access";

export async function getAccessUser(requestHeaders?: Pick<Headers, "get">): Promise<AccessUser | null> {
  return authenticateAccess(requestHeaders ?? await headers(), env);
}
