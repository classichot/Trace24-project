'use client';

import { useTrace24 } from '@/context/trace24-context';
import { Logo } from './ui';

export function Nav() {
  const { page, muni, go, setAdminTab } = useTrace24();
  const showNav = ['dashboard', 'project', 'contractor', 'graph', 'admin', 'prices'].includes(
    page
  );
  if (!showNav) return null;

  const tabs = [
    {
      id: 'dashboard',
      label: 'แดชบอร์ด',
      short: 'แดชบอร์ด',
      active: page === 'dashboard' || page === 'project' || page === 'contractor',
      go: () => go('dashboard'),
    },
    {
      id: 'graph',
      label: 'กราฟความสัมพันธ์',
      short: 'กราฟ',
      active: page === 'graph',
      go: () => go('graph'),
    },
    {
      id: 'prices',
      label: 'ค่ากลางราคา',
      short: 'ราคา',
      active: page === 'prices',
      go: () => go('prices'),
    },
    {
      id: 'admin',
      label: 'ตัวช่วยทำคดี',
      short: 'คดี',
      active: page === 'admin',
      go: () => {
        setAdminTab('investigate');
        go('admin');
      },
    },
  ];

  return (
    <>
      {/* Top bar — tablet landscape / desktop */}
      <div className="trace24-nav-top">
        <div className="trace24-nav-top__inner">
          <Logo onClick={() => go('home', { selMuniId: null, query: '' })} />
          <div className="trace24-nav-top__divider" />
          <div className="trace24-nav-top__muni">
            {muni.th} · จ.{muni.prov || '—'}
          </div>
          <div style={{ flex: 1 }} />
          <div className="trace24-nav-top__tabs">
              {tabs.map((t) => (
              <div
                key={t.id}
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
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </div>
            ))}
            <div
              onClick={() => {
                void fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
                  window.location.href = '/login';
                });
              }}
              className="trace24-hover-text"
              style={{
                cursor: 'pointer',
                fontSize: 12.5,
                color: '#8B8B85',
                marginLeft: 12,
                whiteSpace: 'nowrap',
              }}
              title="ออกจากระบบเดโม"
            >
              ออกจากระบบ
            </div>
          </div>
        </div>
      </div>

      {/* Compact top identity — phone / tablet portrait */}
      <div className="trace24-nav-mobile-head">
        <Logo
          size={14}
          onClick={() => go('home', { selMuniId: null, query: '' })}
        />
        <div className="trace24-nav-mobile-head__muni">
          {muni.th}
          {muni.prov ? ` · จ.${muni.prov}` : ''}
        </div>
      </div>

      {/* Bottom tab bar — phone / tablet portrait */}
      <nav className="trace24-nav-bottom" aria-label="เมนูหลัก">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={t.go}
            className={`trace24-nav-bottom__item${t.active ? ' is-active' : ''}`}
          >
            <span className="trace24-nav-bottom__label">{t.short}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
