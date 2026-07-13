'use client';

import { useTrace24 } from '@/context/trace24-context';
import { Logo } from './ui';

export function Nav() {
  const { page, muni, go } = useTrace24();
  const showNav = ['dashboard', 'project', 'contractor', 'graph', 'admin'].includes(
    page
  );
  if (!showNav) return null;

  const tabs = [
    {
      label: 'แดชบอร์ด',
      active:
        page === 'dashboard' || page === 'project' || page === 'contractor',
      go: () => go('dashboard'),
    },
    {
      label: 'กราฟความสัมพันธ์',
      active: page === 'graph',
      go: () => go('graph'),
    },
    {
      label: 'ระบบภายใน',
      active: page === 'admin',
      go: () => go('admin'),
    },
  ];

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(251,251,249,.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #E4E4E0',
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '0 32px',
          height: 54,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <Logo onClick={() => go('home', { selMuniId: null, query: '' })} />
        <div style={{ width: 1, height: 16, background: '#DDDDD8' }} />
        <div
          style={{
            fontSize: 13,
            color: '#55554F',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {muni.th} · {muni.prov}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            gap: 24,
            alignItems: 'center',
            height: '100%',
          }}
        >
          {tabs.map((t) => (
            <div
              key={t.label}
              onClick={t.go}
              className="trace24-tab"
              style={{
                cursor: 'pointer',
                fontSize: 13,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                borderBottom: `2px solid ${t.active ? '#111110' : 'transparent'}`,
                color: t.active ? '#111110' : '#8B8B85',
                marginBottom: -1,
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
