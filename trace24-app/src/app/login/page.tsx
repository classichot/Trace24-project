import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#FBFBF9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-chakra), "Chakra Petch", sans-serif',
            color: '#8B8B85',
            fontSize: 14,
          }}
        >
          กำลังโหลด…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
