import {
  demoGateEnabled,
  demoPasswordConfigured,
  emailAllowlist,
  gateCookieHeader,
  signGateCookie,
  validateDemoLogin,
} from '@/lib/demo-gate';

export async function POST(req: Request) {
  if (!demoGateEnabled()) {
    return Response.json(
      { error: 'Demo gate disabled', hint: 'Set TRACE24_DEMO_PASSWORD and/or TRACE24_EMAIL_ALLOWLIST' },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    password?: string;
    email?: string;
  };

  const result = validateDemoLogin(body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 401 });
  }

  const token = await signGateCookie(result.email);
  return new Response(
    JSON.stringify({
      ok: true,
      email: result.email,
      requiresPassword: demoPasswordConfigured(),
      requiresEmail: emailAllowlist().length > 0,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': gateCookieHeader(token),
      },
    }
  );
}
