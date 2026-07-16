import { NextResponse, type NextRequest } from 'next/server';
import {
  GATE_COOKIE,
  demoGateEnabled,
  verifyGateCookie,
} from '@/lib/demo-gate';

export async function middleware(req: NextRequest) {
  if (!demoGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Public paths
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(GATE_COOKIE)?.value;
  const session = await verifyGateCookie(token);
  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        error: 'Unauthorized — demo login required',
        hint: 'POST /api/auth/login with password (+ email if allowlist is set)',
      },
      { status: 401 }
    );
  }

  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
