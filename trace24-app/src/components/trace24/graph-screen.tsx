'use client';

import { useMemo } from 'react';
import { C, useTrace24 } from '@/context/trace24-context';
import { sev } from '@/lib/utils';
import { SeverityBadge } from './ui';
import { GraphSvg, type GraphEdge } from './graph-svg';

const G_FILTER_DEFS: [string, string][] = [
  ['all', 'ทั้งหมด'],
  ['projectNode', 'โครงการ'],
  ['company', 'บริษัท'],
  ['people', 'บุคคล · ที่อยู่'],
  ['doc', 'เอกสาร'],
];

export function GraphScreen() {
  const {
    muni,
    dataset,
    graphLayer,
    graphFilter,
    selNodeId,
    setGraphLayer,
    setGraphFilter,
    setSelNodeId,
    go,
  } = useTrace24();

  const G = dataset.graph || { nodes: [], edges: [], details: {} };
  const layer = graphLayer;
  const nodes = Array.isArray(G.nodes) ? G.nodes : [];
  const edges = Array.isArray(G.edges) ? G.edges : [];
  const graphDetails = (G.details || {}) as Record<
    string,
    {
      typeLabel: string;
      label: string;
      sub: string;
      facts: string[];
      docs: string[];
      link?: string | null;
      target?: string;
    }
  >;

  const graphHeader =
    layer === 'country'
      ? 'ประเทศไทย — ภาพรวมเครือข่ายจัดซื้อจัดจ้างภาครัฐ'
      : layer === 'cluster'
        ? `${muni.th} — กลุ่มความสัมพันธ์ที่ตรวจพบ`
        : `${muni.th} — ${dataset.meta?.graphTitle || 'เครือข่าย'}`;

  const graphNote =
    layer === 'country'
      ? 'ชั้นที่ 1 · ภาพรวมประเทศ — ความหนาแน่นของสัญญาณตามจังหวัดและสังกัด'
      : layer === 'cluster'
        ? 'ชั้นที่ 2 · กลุ่มความสัมพันธ์ — จัดกลุ่มจากกรรมการร่วม ผู้ถือหุ้น ที่อยู่จดทะเบียน และรูปแบบการเสนอราคา'
        : `ชั้นที่ 3 · รายหน่วย — ${dataset.meta?.graphNote || '—'}`;

  const nodeById = useMemo(() => {
    const map: Record<string, (typeof nodes)[0]> = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodes]);

  const details = graphDetails;

  const activeNodeId = useMemo(() => {
    if (details[selNodeId] || nodeById[selNodeId]) return selNodeId;
    if (dataset.def?.node && (details[dataset.def.node] || nodeById[dataset.def.node])) {
      return dataset.def.node;
    }
    if (details.muni || nodeById.muni) return 'muni';
    return nodes[0]?.id ?? selNodeId;
  }, [selNodeId, dataset.def?.node, details, nodeById, nodes]);

  const gSel = useMemo(() => {
    const fromDetails = details[activeNodeId] ?? details[dataset.def?.node ?? ''] ?? details.muni;
    if (fromDetails) return fromDetails;
    const node = nodeById[activeNodeId] ?? nodes[0];
    return {
      typeLabel: node?.type === 'project' ? 'โครงการ' : node?.type === 'company' ? 'ผู้รับจ้าง' : 'หน่วยงาน',
      label: node?.label || muni.th,
      sub: dataset.meta?.graphNote || '—',
      facts: ['ยังไม่มีรายละเอียดโหนดนี้ในกราฟ'],
      docs: [] as string[],
      link: null as string | null,
      target: undefined as string | undefined,
    };
  }, [details, activeNodeId, dataset.def?.node, dataset.meta?.graphNote, nodeById, nodes, muni.th]);

  const gConns = useMemo(
    () =>
      edges
        .filter((e) => e[0] === activeNodeId || e[1] === activeNodeId)
        .map((e) => {
          const otherId = (e[0] === activeNodeId ? e[1] : e[0]) as string;
          const other = nodeById[otherId];
          return {
            label: other?.label || otherId,
            rel: e[2] as string,
            go: () => setSelNodeId(otherId),
          };
        }),
    [edges, activeNodeId, nodeById, setSelNodeId]
  );

  const gSelLinkLabel =
    gSel.link === 'project'
      ? 'เปิดหน้าตรวจสอบโครงการ →'
      : gSel.link === 'contractor'
        ? 'เปิดโปรไฟล์ผู้รับจ้าง →'
        : null;

  const handleSelOpen = () => {
    if (gSel.link === 'project' && gSel.target) go('project', { selProjectId: gSel.target });
    else if (gSel.link === 'contractor' && gSel.target) {
      go('contractor', { selContractorId: gSel.target });
    }
  };

  return (
    <div
      data-screen-label="กราฟความสัมพันธ์"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        padding: '36px 32px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', color: '#8B8B85', fontWeight: 500 }}>
            กราฟความสัมพันธ์
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: '10px 0 4px' }}>{graphHeader}</h1>
          <div style={{ fontSize: 13, color: '#55554F' }}>{graphNote}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', border: '1px solid #111110' }}>
            {(
              [
                ['country', 'ประเทศ'],
                ['cluster', 'กลุ่มความสัมพันธ์'],
                ['entity', 'รายหน่วย · บุคคล'],
              ] as const
            ).map(([key, label], i) => (
              <div
                key={key}
                onClick={() => setGraphLayer(key)}
                style={{
                  fontSize: 12,
                  padding: '7px 16px',
                  background: layer === key ? '#111110' : 'transparent',
                  color: layer === key ? '#FBFBF9' : '#55554F',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRight: i < 2 ? '1px solid #111110' : 'transparent',
                }}
              >
                {label}
              </div>
            ))}
          </div>
          {layer === 'entity' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {G_FILTER_DEFS.map(([key, label]) => {
                const active = graphFilter === key;
                return (
                  <div
                    key={key}
                    onClick={() => setGraphFilter(key as typeof graphFilter)}
                    style={{
                      fontSize: 12,
                      padding: '6px 13px',
                      border: `1px solid ${active ? '#111110' : '#DDDDD8'}`,
                      background: active ? '#111110' : 'transparent',
                      color: active ? '#FBFBF9' : '#55554F',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {layer === 'entity' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 0,
            marginTop: 24,
            border: '1px solid #E4E4E0',
            background: '#fff',
            alignItems: 'stretch',
          }}
        >
          <div style={{ position: 'relative', minWidth: 0 }}>
            <GraphSvg
              nodes={nodes}
              edges={edges as GraphEdge[]}
              selNodeId={activeNodeId}
              graphFilter={graphFilter}
              onSelectNode={setSelNodeId}
            />
            <div
              style={{
                position: 'absolute',
                left: 16,
                bottom: 12,
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                fontSize: 11,
                color: '#8B8B85',
                alignItems: 'center',
              }}
            >
              {[
                ['#111110', 'solid', 'เทศบาล'],
                ['#ECECE8', 'border', 'โครงการ'],
                ['transparent', 'ring', 'บริษัท'],
                ['transparent', 'person', 'บุคคล'],
                ['transparent', 'dashed', 'ที่อยู่'],
                ['transparent', 'square', 'เอกสาร'],
              ].map(([color, type, label]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: type === 'square' ? 0 : '50%',
                      background: type === 'border' || type === 'ring' || type === 'person' || type === 'dashed' || type === 'square' ? 'transparent' : (color as string),
                      border: type === 'border' ? '1px solid #B4B4AE' : type === 'ring' ? '1.5px solid #111110' : type === 'person' ? '1px solid #8B8B85' : type === 'dashed' ? '1px dashed #55554F' : type === 'square' ? '1px solid #8B8B85' : 'none',
                      display: 'inline-block',
                      boxSizing: 'border-box',
                    }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #E4E4E0', padding: 24, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#8B8B85' }}>{gSel.typeLabel}</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{gSel.label}</div>
            <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 4 }}>{gSel.sub}</div>
            <div style={{ marginTop: 18, borderTop: '1px solid #E4E4E0' }}>
              {gSel.facts.map((gfact, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12.5,
                    padding: '9px 0',
                    borderBottom: '1px solid #EEEEEA',
                    lineHeight: 1.55,
                    color: '#26261F',
                  }}
                >
                  {gfact}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#8B8B85', marginTop: 20 }}>
              การเชื่อมโยง · {gConns.length}
            </div>
            <div style={{ marginTop: 8 }}>
              {gConns.map((gc, i) => (
                <div
                  key={i}
                  onClick={gc.go}
                  className="trace24-hover-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 12.5,
                    padding: '8px 0',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gc.label}</span>
                  <span style={{ fontSize: 10.5, color: '#8B8B85', flex: 'none' }}>{gc.rel}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: '#8B8B85', marginTop: 20 }}>หลักฐาน</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {gSel.docs.map((gd) => (
                <span
                  key={gd}
                  className="trace24-chip"
                  style={{
                    fontSize: 11,
                    padding: '4px 9px',
                    border: '1px solid #DDDDD8',
                    color: '#55554F',
                    cursor: 'pointer',
                  }}
                >
                  {gd} ↗
                </span>
              ))}
            </div>
            {gSel.link && (
              <div
                onClick={handleSelOpen}
                className="trace24-btn-outline"
                style={{
                  marginTop: 22,
                  border: '1px solid #111110',
                  padding: '10px 14px',
                  fontSize: 13,
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {gSelLinkLabel}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div
              style={{
                fontSize: 11,
                color: '#8B8B85',
                marginTop: 24,
                lineHeight: 1.55,
                fontStyle: 'italic',
              }}
            >
              ความสัมพันธ์เป็นเพียงตัวชี้ ไม่ใช่ข้อพิสูจน์ — การจับคู่นิติบุคคลที่ไม่แน่นอนจะถูกส่งให้เจ้าหน้าที่ตรวจสอบ
            </div>
          </div>
        </div>
      )}

      {layer === 'cluster' && (
        <div style={{ marginTop: 24, borderTop: '1px solid #111110' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 190px 90px 80px',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #E4E4E0',
              fontSize: 11,
              color: '#8B8B85',
            }}
          >
            <div>กลุ่มความสัมพันธ์</div>
            <div>องค์ประกอบ</div>
            <div>สัญญาณ</div>
            <div style={{ textAlign: 'right' }}>ระดับ</div>
          </div>
          {(Array.isArray(dataset.clusters) ? dataset.clusters : []).map((cl, i) => {
            const s = sev(cl.sevKey);
            return (
              <div
                key={i}
                onClick={() => {
                  setGraphLayer('entity');
                  setSelNodeId(cl.node);
                }}
                className="trace24-hover-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 190px 90px 80px',
                  gap: 16,
                  padding: '18px 0',
                  borderBottom: '1px solid #EEEEEA',
                  cursor: 'pointer',
                  alignItems: 'baseline',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{cl.name}</div>
                  <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 5, lineHeight: 1.55 }}>{cl.sub}</div>
                </div>
                <div style={{ fontSize: 12.5, color: '#55554F', lineHeight: 1.55 }}>{cl.comp}</div>
                <div style={{ fontSize: 13.5 }}>{cl.signals} สัญญาณ</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                </div>
              </div>
            );
          })}
          {(Array.isArray(dataset.clusters) ? dataset.clusters : []).length === 0 && (
            <div style={{ padding: '28px 0', fontSize: 13.5, color: '#55554F', lineHeight: 1.6 }}>
              ยังไม่พบกลุ่มความสัมพันธ์ — ดึงสัญญาแล้วจะแสดงกลุ่มผู้รับจ้างหลัก ·
              เพิ่มทำเนียบ/กรรมการที่แท็บความเชื่อมโยงเพื่อตรวจสัญญาณ R5/R13
            </div>
          )}
          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
            คลิกกลุ่มเพื่อเจาะลงชั้นที่ 3 (กราฟรายหน่วย · บุคคล) — ทุกการจัดกลุ่มมีเอกสารต้นทางรองรับ
          </div>
        </div>
      )}

      {layer === 'country' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 270px', gap: 40, marginTop: 24, alignItems: 'start' }}>
          <div>
            <div style={{ borderTop: '1px solid #111110' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(150px, 1fr) 74px 74px 70px 100px',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid #E4E4E0',
                  fontSize: 11,
                  color: '#8B8B85',
                }}
              >
                <div>จังหวัด / สังกัด</div>
                <div>หน่วยงาน</div>
                <div>คลัสเตอร์</div>
                <div>สัญญาณ</div>
                <div>ความหนาแน่น</div>
              </div>
              {C.provinces.map((pv, i) => (
                <div
                  key={i}
                  onClick={() => setGraphLayer('cluster')}
                  className="trace24-hover-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(150px, 1fr) 74px 74px 70px 100px',
                    gap: 12,
                    padding: '13px 0',
                    borderBottom: '1px solid #EEEEEA',
                    cursor: 'pointer',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 13.5 }}>{pv.label}</div>
                  <div style={{ fontSize: 13, color: '#55554F' }}>{pv.ag}</div>
                  <div style={{ fontSize: 13, color: '#55554F' }}>{pv.cl}</div>
                  <div style={{ fontSize: 13 }}>{pv.sig}</div>
                  <div style={{ height: 3, background: '#ECECE8' }}>
                    <div style={{ height: 3, background: 'var(--accent)', width: pv.pct }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
              เรียงตามจำนวนสัญญาณ · คลิกแถวเพื่อเจาะลงชั้นที่ 2 (กลุ่มความสัมพันธ์)
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>ภาพรวมประเทศ</h2>
            <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
              {C.stats.map((cs, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    padding: '11px 0',
                    borderBottom: '1px solid #EEEEEA',
                  }}
                >
                  <div style={{ fontSize: 12.5, color: '#55554F' }}>{cs.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{cs.n}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 12, lineHeight: 1.6 }}>
              คลัสเตอร์ข้ามหน่วยงาน = กลุ่มนิติบุคคล/บุคคลเดียวกันที่ชนะการประมูลในหลายหน่วยงานหรือหลายจังหวัด — ชั้นข้อมูลนี้ใช้จัดลำดับความสำคัญการตรวจสอบระดับประเทศ
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
