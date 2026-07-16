import {
  GATE_COOKIE,
  demoGateEnabled,
  demoPasswordConfigured,
  emailAllowlist,
  verifyGateCookie,
} from '@/lib/demo-gate';

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${GATE_COOKIE}=([^;]*)`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  const session = await verifyGateCookie(token);

  return Response.json({
    gateEnabled: demoGateEnabled(),
    requiresPassword: demoPasswordConfigured(),
    requiresEmail: emailAllowlist().length > 0,
    authenticated: Boolean(session) || !demoGateEnabled(),
    email: session?.email || null,
    adminTokenHint: 'Admin writes still need TRACE24_ADMIN_TOKEN in Admin UI',
  });
}
