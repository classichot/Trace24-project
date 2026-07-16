'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(true);
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [gateEnabled, setGateEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => {
        setGateEnabled(!!d.gateEnabled);
        setRequiresPassword(!!d.requiresPassword);
        setRequiresEmail(!!d.requiresEmail);
        if (!d.gateEnabled) {
          router.replace('/');
          return;
        }
        if (d.authenticated) {
          router.replace(nextPath.startsWith('/') ? nextPath : '/');
        }
      })
      .catch(() => {});
  }, [router, nextPath]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      router.replace(nextPath.startsWith('/') ? nextPath : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
      setBusy(false);
    }
  };

  if (!gateEnabled) return null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FBFBF9',
        color: '#111110',
        fontFamily: 'var(--font-chakra), "Chakra Petch", sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ fontWeight: 700, fontSize: 36, letterSpacing: '.01em', lineHeight: 1.1 }}>
          TRACE<span style={{ color: '#8B8B85' }}>24</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: '18px 0 8px' }}>เข้าสู่ระบบเดโม</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: '#55554F', lineHeight: 1.55 }}>
          จำกัดผู้เข้าถึงสำหรับเดโม — การเขียนใน Admin ยังต้องใช้ Admin token แยกต่างหาก
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 28 }}>
          {(requiresEmail || !requiresPassword) && (
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 6 }}>อีเมลที่ได้รับอนุญาต</div>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={requiresEmail}
                placeholder="name@example.com"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #111110',
                  background: '#fff',
                  padding: '14px 16px',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </label>
          )}

          {requiresPassword && (
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 6 }}>รหัสผ่านเดโม</div>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={requiresPassword}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #111110',
                  background: '#fff',
                  padding: '14px 16px',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </label>
          )}

          {error && (
            <div style={{ fontSize: 13, color: '#8A5A1C', marginBottom: 14, lineHeight: 1.5 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              border: '1px solid #111110',
              background: busy ? '#EEEEEA' : '#111110',
              color: busy ? '#55554F' : '#FBFBF9',
              padding: '14px 18px',
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12, color: '#8B8B85', lineHeight: 1.55 }}>
          Cookie session 7 วัน · Admin token สำหรับบันทึกข้อมูลตั้งในหน้าตัวช่วยทำคดี
        </div>
      </div>
    </div>
  );
}
