import type { CSSProperties, ReactNode } from 'react';

export function Logo({
  onClick,
  size = 15,
}: {
  onClick?: () => void;
  size?: number;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '.01em',
      }}
    >
      TRACE<span style={{ color: '#8B8B85' }}>24</span>
    </div>
  );
}

export function Footer() {
  return (
    <div style={{ borderTop: '1px solid #E4E4E0' }}>
      <div
        style={{
          maxWidth: 1160,
          margin: '0 auto',
          padding: '20px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12, color: '#8B8B85', lineHeight: 1.5 }}>
          สัญญาณความเสี่ยงไม่ใช่ข้อพิสูจน์การทุจริต —
          เป็นเพียงเหตุผลสำหรับการตรวจสอบเพิ่มเติม
        </div>
        <div style={{ fontSize: 12, color: '#8B8B85' }}>
          ต้นแบบ · หน่วยงาน บริษัท และเอกสารทั้งหมดเป็นข้อมูลสมมติ
        </div>
      </div>
    </div>
  );
}

export function SeverityBadge({
  label,
  color,
  border,
}: {
  label: string;
  color: string;
  border: string;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: '.06em',
        padding: '3px 7px',
        border: `1px solid ${border}`,
        color,
      }}
    >
      {label}
    </span>
  );
}

export function RiskDisclaimer({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: '#8B8B85',
        marginTop: 14,
        fontStyle: 'italic',
        ...style,
      }}
    >
      สัญญาณความเสี่ยงไม่ใช่ข้อพิสูจน์การทุจริต —
      เป็นเพียงเหตุผลสำหรับการตรวจสอบเพิ่มเติม
    </div>
  );
}

/** Animated busy indicator — use whenever data is fetching / generating. */
export function LoadingHint({
  label,
  hint,
  variant = 'block',
  style,
}: {
  label: string;
  hint?: string;
  variant?: 'block' | 'inline';
  style?: CSSProperties;
}) {
  const isInline = variant === 'inline';
  return (
    <div
      className={`trace24-loading-hint ${isInline ? 'trace24-loading-hint--inline' : 'trace24-loading-hint--block'}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="trace24-loading-hint__row">
        <div className={`trace24-scan-spin${isInline ? ' trace24-scan-spin--sm' : ''}`} aria-hidden />
        <div className="trace24-loading-hint__label">
          {label}
          <span className="trace24-scan-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </div>
      </div>
      {!isInline && <div className="trace24-scan-track" aria-hidden />}
      {!isInline && hint ? <div className="trace24-loading-hint__hint">{hint}</div> : null}
    </div>
  );
}

export function PageShell({
  children,
  maxWidth = 1160,
  padding = '36px 32px 80px',
}: {
  children: ReactNode;
  maxWidth?: number | string;
  padding?: string;
}) {
  return (
    <div
      style={{
        maxWidth,
        margin: '0 auto',
        padding,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  fontSize: 13.5,
  border: '1px solid #C9C9C4',
  fontFamily: 'inherit',
  outline: 'none',
  borderRadius: 0,
  background: '#fff',
};

export const selectStyle: CSSProperties = {
  ...inputStyle,
};
