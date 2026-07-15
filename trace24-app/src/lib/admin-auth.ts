/**
 * Protect Admin mutating APIs.
 *
 * - If TRACE24_ADMIN_TOKEN is set → require matching Bearer / x-trace24-admin-token
 * - On Vercel without token configured → deny writes (force ops to set a token)
 * - Local/dev without token → allow (operator convenience)
 */

export function adminTokenConfigured(): boolean {
  return Boolean(process.env.TRACE24_ADMIN_TOKEN?.trim());
}

export function isServerlessProduction(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function extractAdminToken(req: Request): string {
  const header = req.headers.get('x-trace24-admin-token')?.trim() || '';
  if (header) return header;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || '';
}

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string; hint?: string };

export function assertAdminWrite(req: Request): AdminAuthResult {
  const expected = process.env.TRACE24_ADMIN_TOKEN?.trim() || '';

  if (!expected) {
    if (isServerlessProduction()) {
      return {
        ok: false,
        status: 503,
        error: 'Admin writes disabled — set TRACE24_ADMIN_TOKEN on Vercel',
        hint: 'vercel env add TRACE24_ADMIN_TOKEN production',
      };
    }
    return { ok: true };
  }

  const provided = extractAdminToken(req);
  if (!provided || provided !== expected) {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized — admin token required',
      hint: 'Send header x-trace24-admin-token (or Authorization: Bearer …)',
    };
  }
  return { ok: true };
}

export function adminUnauthorizedResponse(result: Extract<AdminAuthResult, { ok: false }>) {
  return Response.json(
    { error: result.error, hint: result.hint },
    { status: result.status }
  );
}
