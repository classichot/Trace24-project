import { clearGateCookieHeader } from '@/lib/demo-gate';

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearGateCookieHeader(),
    },
  });
}
