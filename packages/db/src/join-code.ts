// A community's join code is stored only as this hash (`community.join_code_hash`). Web Crypto
// runs in Bun and in Workers, so the seed and the API's join route (US-009) hash it the same way.
export async function hashJoinCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
