/**
 * Share-token minting for public report links.
 *
 * The token IS the capability — anyone holding it can read the report without
 * an account — so it must be unguessable, not merely unique. 18 random bytes
 * (144 bits, base64url → 24 chars) is well past the point where enumeration is
 * meaningful, and stays short enough to survive an email client's line wrap.
 *
 * Server-only: `node:crypto` is not available in the browser bundle, and a
 * client-minted token would be attacker-chosen.
 */

import "server-only";
import { randomBytes } from "node:crypto";

const TOKEN_BYTES = 18;

export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Shape check for a token arriving from the URL. Cheap rejection of obvious
 * junk before it reaches the database; not a security boundary on its own.
 */
export function isValidShareTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}
