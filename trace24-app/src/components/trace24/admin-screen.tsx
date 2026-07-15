'use client';

import { useEffect, useState } from 'react';
import { adminWriteError, adminWriteHeaders, getAdminToken, setAdminToken } from '@/lib/admin-client';
import { isRealAgency } from '@/lib/agencies';
import { useTrace24 } from '@/context/trace24-context';
import { REVIEW_OPTIONS, sev } from '@/lib/utils';
import { SeverityBadge, inputStyle, selectStyle, RiskDisclaimer, LoadingHint } from './ui';
import type { InvestigationPack, PipelineStatusResponse, HybridRagResult } from '@/lib/pipeline/types';

type LlmReview = {
  model: string;
  summary: string;
  reviews: {
    signalId: string;
    likelyFalsePositive: boolean;
    priorityBoost: string;
    rationale: string;
    followUpQuestion: string;
  }[];
};

type LlmRules = {
  model: string;
  notes: string;
  persisted?: boolean;
  proposals: {
    id?: string;
    suggestedRuleId: string;
    title: string;
    category: string;
    rationale: string;
    featureHints: string[];
    thresholdSketch: string;
    status?: string;
    executable?: { kind: string } | null;
  }[];
};

type RuleProposalRow = {
  id: string;
  suggestedRuleId: string;
  title: string;
  category: string;
  rationale: string;
  thresholdSketch: string;
  status: 'draft' | 'approved' | 'rejected';
  model: string;
  agencyId: string;
  executable: { kind: string; minShare?: number; minCount?: number; minRatio?: number } | null;
  featureHints: string[];
  createdAt: string;
};

type LlmBrief = {
  model: string;
  refinedSummary: string;
  prioritizedLeads: string[];
  accuracyNotes: string[];
};

const ADMIN_TABS = [
  ['crawl', 'การเก็บข้อมูล'],
  ['queue', 'คิวประมวลผลเอกสาร'],
  ['entities', 'ตรวจการจับคู่นิติบุคคล'],
  ['related', 'ความเชื่อมโยง'],
  ['review', 'สถานะการตรวจสอบ'],
  ['case', 'พื้นที่ทำงานคดี'],
  ['pipeline', 'สถาปัตยกรรมท่อข้อมูล'],
  ['investigate', 'ผู้ช่วยสอบสวน'],
  ['rules', 'Rule Proposer'],
] as const;

export function AdminScreen() {
  const {
    dataset,
    adminTab,
    setAdminTab,
    erDecisions,
    setErDecision,
    reviewStates,
    setReviewState,
    caseNote,
    setCaseNote,
    addCaseNote,
    caseNotesAdded,
    scannedId,
  } = useTrace24();

  const [adminTokenDraft, setAdminTokenDraft] = useState('');
  useEffect(() => {
    setAdminTokenDraft(getAdminToken());
  }, []);

  const CF = {
    id: dataset.caseFile?.id || `case-${scannedId || 'unknown'}`,
    title: dataset.caseFile?.title || 'สำนวนหน่วยงาน',
    summary: dataset.caseFile?.summary || 'ยังไม่มีสรุปสำนวน — สแกนหน่วยงานแล้วเปิดแท็บนี้ใหม่',
    status: dataset.caseFile?.status || 'ร่าง',
    opened: dataset.caseFile?.opened || '—',
    owner: dataset.caseFile?.owner || 'รอมอบหมายผู้ตรวจ',
    signals: dataset.caseFile?.signals || '—',
    evidence: dataset.caseFile?.evidence || [],
    questions: dataset.caseFile?.questions || [],
    timeline: dataset.caseFile?.timeline || [],
    parties: dataset.caseFile?.parties || [],
    money: dataset.caseFile?.money || [],
    notes: dataset.caseFile?.notes || [],
  };
  const caseAdded = caseNotesAdded[CF.id] ?? [];
  const caseNotes = [
    ...caseAdded.map((n) => ({ date: n[0], text: n[1] })),
    ...CF.notes.map((n) => ({ date: n[0], text: n[1] })),
  ];

  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusResponse | null>(null);
  const [pack, setPack] = useState<InvestigationPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [ragQuery, setRagQuery] = useState('ผู้ชนะ');
  const [ragResult, setRagResult] = useState<(HybridRagResult & { llm?: { model: string }; llmError?: string }) | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ enabled: boolean; model: string; note: string } | null>(null);
  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [llmReview, setLlmReview] = useState<LlmReview | null>(null);
  const [llmRules, setLlmRules] = useState<LlmRules | null>(null);
  const [llmBrief, setLlmBrief] = useState<LlmBrief | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [ruleRows, setRuleRows] = useState<RuleProposalRow[]>([]);
  const [ruleFbSummary, setRuleFbSummary] = useState<{
    confirmed: number;
    falsePositive: number;
    needsData: number;
    total: number;
  } | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);
  const [relatedPackJson, setRelatedPackJson] = useState('');
  const [relatedMatches, setRelatedMatches] = useState<
    { id: string; ruleId: string; matchType: string; severity: string; explanation: string }[]
  >([]);
  const [relatedCoverage, setRelatedCoverage] = useState('');
  const [relatedMsg, setRelatedMsg] = useState<string | null>(null);
  const [relatedBusy, setRelatedBusy] = useState(false);
  const [relatedFetchBusy, setRelatedFetchBusy] = useState(false);
  const [relatedDirectorsBusy, setRelatedDirectorsBusy] = useState(false);
  const [relatedAgeBusy, setRelatedAgeBusy] = useState(false);
  const [relatedExecUrl, setRelatedExecUrl] = useState('');
  const [relatedDbdPaste, setRelatedDbdPaste] = useState('');
  const [relatedDbdTin, setRelatedDbdTin] = useState('');
  const [relatedDbdName, setRelatedDbdName] = useState('');

  useEffect(() => {
    if (adminTab !== 'related') return;
    const known: Record<string, string> = {
      'egp-5501408': 'paphaichiangmai.go.th',
      'egp-6510407': 'paphai.go.th',
      phothale: 'phothale.go.th',
      nakornnont: 'nakornnont.go.th',
      nongyaeng: 'nongyaeng.go.th',
    };
    const web = dataset.agency?.web || (scannedId ? known[scannedId] : '') || '';
    if (!web) return;
    setRelatedExecUrl((prev) => {
      if (prev.trim()) return prev;
      return web.includes('://') ? web : `https://www.${web.replace(/^www\./, '')}/`;
    });
  }, [adminTab, scannedId, dataset.agency?.web]);

  useEffect(() => {
    if (adminTab !== 'pipeline') return;
    fetch('/api/pipeline')
      .then((r) => r.json())
      .then(setPipelineStatus)
      .catch(() => setPipelineStatus(null));
  }, [adminTab]);

  useEffect(() => {
    if (adminTab !== 'investigate') return;
    fetch('/api/llm/status')
      .then((r) => r.json())
      .then((d) => setLlmStatus({ enabled: !!d.enabled, model: d.model || '—', note: d.note || '' }))
      .catch(() => setLlmStatus(null));
  }, [adminTab]);

  useEffect(() => {
    if (adminTab !== 'investigate') return;
    if (!scannedId || !isRealAgency(scannedId)) {
      setPack(null);
      setPackError('สแกนหน่วยงานจากหน้าแรกก่อน แล้วกลับมาที่ผู้ช่วยสอบสวน');
      return;
    }
    setPackLoading(true);
    setPackError(null);
    fetch(`/api/agencies/${encodeURIComponent(scannedId)}/investigate`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((data: InvestigationPack) => setPack(data))
      .catch((e: Error) => {
        setPack(null);
        setPackError(e.message);
      })
      .finally(() => setPackLoading(false));
  }, [adminTab, scannedId]);

  useEffect(() => {
    if (adminTab !== 'related') return;
    if (!isRealAgency(scannedId)) {
      setRelatedPackJson('');
      setRelatedMatches([]);
      setRelatedCoverage('');
      setRelatedMsg('สแกนหน่วยงานจริงก่อน แล้วกลับมาใส่ทำเนียบผู้บริหาร + กรรมการผู้ชนะ');
      return;
    }
    setRelatedBusy(true);
    setRelatedMsg(null);
    fetch(`/api/agencies/${scannedId}/related`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRelatedPackJson(JSON.stringify(d.pack, null, 2));
        setRelatedMatches(d.matches || []);
        setRelatedCoverage(d.coverage || '');
        setRelatedMsg(d.ethics || null);
      })
      .catch((e: Error) => setRelatedMsg(e.message))
      .finally(() => setRelatedBusy(false));
  }, [adminTab, scannedId]);

  const saveRelatedPack = () => {
    if (!isRealAgency(scannedId)) return;
    setRelatedBusy(true);
    setRelatedMsg(null);
    let body: unknown;
    try {
      body = JSON.parse(relatedPackJson);
    } catch {
      setRelatedBusy(false);
      setRelatedMsg('JSON ไม่ถูกต้อง');
      return;
    }
    fetch(`/api/agencies/${scannedId}/related`, {
      method: 'PUT',
      headers: adminWriteHeaders(),
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((d) => {
        setRelatedPackJson(JSON.stringify(d.pack, null, 2));
        setRelatedMatches(d.matches || []);
        setRelatedMsg(d.ethics || 'บันทึกแล้ว — สแกนหน่วยงานใหม่เพื่ออัปเดตแดชบอร์ด');
      })
      .catch((e: Error) => setRelatedMsg(e.message))
      .finally(() => setRelatedBusy(false));
  };

  const fetchExecutivesFromWeb = () => {
    if (!isRealAgency(scannedId)) return;
    setRelatedFetchBusy(true);
    setRelatedMsg(null);
    const web = dataset.agency?.web || '';
    fetch(`/api/agencies/${encodeURIComponent(scannedId)}/related/fetch-executives`, {
      method: 'POST',
      headers: adminWriteHeaders(),
      body: JSON.stringify({
        url: relatedExecUrl.trim() || undefined,
        web: web || undefined,
        merge: true,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((d) => {
        if (d.draftPack) setRelatedPackJson(JSON.stringify(d.draftPack, null, 2));
        const srcOk = (d.sources || []).filter((s: { ok: boolean }) => s.ok).length;
        setRelatedMsg(
          `${d.note || ''}${d.model ? ` · model ${d.model}` : ''} · หน้าที่ดึงได้ ${srcOk}/${(d.sources || []).length} — ตรวจแก้ JSON แล้วกดบันทึก`
        );
      })
      .catch((e: Error) => setRelatedMsg(e.message))
      .finally(() => setRelatedFetchBusy(false));
  };

  const fetchDirectorsFromDbd = (mode: 'winners' | 'paste' = 'winners') => {
    if (!isRealAgency(scannedId)) return;
    setRelatedDirectorsBusy(true);
    setRelatedMsg(null);
    const body =
      mode === 'paste'
        ? {
            merge: true,
            pasteText: relatedDbdPaste.trim(),
            pasteTin: relatedDbdTin.trim() || undefined,
            pasteName: relatedDbdName.trim() || undefined,
          }
        : { merge: true, limit: 10 };
    fetch(`/api/agencies/${encodeURIComponent(scannedId)}/related/fetch-directors`, {
      method: 'POST',
      headers: adminWriteHeaders(),
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((d) => {
        if (d.draftPack) setRelatedPackJson(JSON.stringify(d.draftPack, null, 2));
        const nCo = (d.companies || []).length;
        const nDir = (d.companies || []).reduce(
          (s: number, c: { directors?: unknown[] }) => s + (c.directors?.length || 0),
          0
        );
        setRelatedMsg(
          `${d.note || ''}${d.model ? ` · model ${d.model}` : ''} · draft ${nCo} บริษัท / ${nDir} รายชื่อ — ตรวจแก้แล้วกดบันทึก${
            d.disclaimer ? ` · ${d.disclaimer}` : ''
          }`
        );
        if (mode === 'paste' && d.ok) setRelatedDbdPaste('');
      })
      .catch((e: Error) => setRelatedMsg(e.message))
      .finally(() => setRelatedDirectorsBusy(false));
  };

  const fetchCompanyAgeFromWeb = () => {
    if (!isRealAgency(scannedId)) return;
    setRelatedAgeBusy(true);
    setRelatedMsg(null);
    fetch(`/api/agencies/${encodeURIComponent(scannedId)}/related/fetch-company-age`, {
      method: 'POST',
      headers: adminWriteHeaders(),
      body: JSON.stringify({ merge: true, limit: 6 }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((d) => {
        if (d.draftPack) setRelatedPackJson(JSON.stringify(d.draftPack, null, 2));
        const nAge = (d.companies || []).filter(
          (c: { registeredAt?: string | null }) => c.registeredAt
        ).length;
        const nAddr = (d.companies || []).filter(
          (c: { address?: string }) => c.address && c.address.length > 8
        ).length;
        setRelatedMsg(
          `${d.note || ''}${d.model ? ` · model ${d.model}` : ''} · วันที่ ${nAge} · ที่อยู่ ${nAddr} — ตรวจแล้วกดบันทึก (ที่อยู่ร่วมชนะ >5 → R19)`
        );
      })
      .catch((e: Error) => setRelatedMsg(e.message))
      .finally(() => setRelatedAgeBusy(false));
  };

  const relatedAnyBusy = relatedFetchBusy || relatedDirectorsBusy || relatedAgeBusy;

  const runRag = () => {
    if (!isRealAgency(scannedId) || ragQuery.trim().length < 2) return;
    setRagLoading(true);
    fetch(`/api/agencies/${scannedId}/rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ragQuery.trim(), useLlm: true }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setRagResult(data))
      .catch(() => setRagResult(null))
      .finally(() => setRagLoading(false));
  };

  useEffect(() => {
    if (adminTab !== 'rules') return;
    setRulesLoading(true);
    fetch('/api/rules')
      .then((r) => r.json())
      .then((d) => {
        setRuleRows(d.proposals || []);
        setRuleFbSummary(d.feedbackSummary || null);
      })
      .catch(() => setRuleRows([]))
      .finally(() => setRulesLoading(false));
  }, [adminTab]);

  const runLlmAction = (action: 'review-signals' | 'propose-rules' | 'refine-brief') => {
    if (!scannedId || !isRealAgency(scannedId)) {
      setLlmError('สแกนหน่วยงานข้อมูลจริงก่อน (เช่น egp-… หรือโพทะเล)');
      return;
    }
    setLlmBusy(action);
    setLlmError(null);
    fetch(`/api/agencies/${encodeURIComponent(scannedId)}/llm`, {
      method: 'POST',
      headers: adminWriteHeaders(),
      body: JSON.stringify({ action, persist: true }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((data) => {
        if (action === 'review-signals') setLlmReview(data);
        if (action === 'propose-rules') {
          setLlmRules(data);
          setAdminTab('rules');
          fetch('/api/rules')
            .then((r) => r.json())
            .then((d) => {
              setRuleRows(d.proposals || []);
              setRuleFbSummary(d.feedbackSummary || null);
            })
            .catch(() => undefined);
        }
        if (action === 'refine-brief') setLlmBrief(data);
      })
      .catch((e: Error) => setLlmError(e.message))
      .finally(() => setLlmBusy(null));
  };

  const decideRule = (ruleId: string, status: 'approved' | 'rejected') => {
    setRulesMsg(null);
    fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: adminWriteHeaders(),
      body: JSON.stringify({ status, by: 'admin' }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        return data;
      })
      .then((data) => {
        setRuleRows((rows) => rows.map((r) => (r.id === ruleId ? { ...r, ...data.proposal } : r)));
        setRulesMsg(status === 'approved' ? 'อนุมัติแล้ว — กฎจะรันใน detect รอบถัดไป' : 'ปฏิเสธร่างกฎแล้ว');
      })
      .catch((e: Error) => setRulesMsg(e.message));
  };

  const sendSignalFeedback = (signalId: string, ruleId: string | undefined, label: 'confirmed' | 'false_positive' | 'needs_data') => {
    if (!isRealAgency(scannedId)) return;
    fetch('/api/rules', {
      method: 'POST',
      headers: adminWriteHeaders(),
      body: JSON.stringify({ action: 'feedback', agencyId: scannedId, signalId, ruleId, label }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(await adminWriteError(r, data));
        setRulesMsg(`บันทึก feedback: ${label}`);
        if (data.summary) setRuleFbSummary(data.summary);
      })
      .catch((e: Error) => setRulesMsg(e.message));
  };

  return (
    <div
      data-screen-label="ตัวช่วยทำคดี"
      style={{
        maxWidth: 1160,
        margin: '0 auto',
        padding: '36px 32px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: 0 }}>ตัวช่วยทำคดี</h1>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.08em',
            padding: '3px 8px',
            border: '1px solid #C9C9C4',
            color: '#55554F',
          }}
        >
          ภายใน · จำกัดสิทธิ์
        </span>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: '14px 16px',
          background: '#F6F6F3',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 12.5, color: '#55554F', flex: '1 1 220px', lineHeight: 1.5 }}>
          Admin token สำหรับบันทึก/ดึงกรรมการ/ร่างกฎบน production (เก็บใน session นี้เท่านั้น)
        </div>
        <input
          type="password"
          value={adminTokenDraft}
          onChange={(e) => setAdminTokenDraft(e.target.value)}
          placeholder="TRACE24_ADMIN_TOKEN"
          style={{ ...inputStyle, flex: '1 1 200px', maxWidth: 320 }}
        />
        <div
          onClick={() => {
            setAdminToken(adminTokenDraft);
            setRelatedMsg(adminTokenDraft.trim() ? 'บันทึก admin token ใน session แล้ว' : 'ล้าง admin token แล้ว');
          }}
          className="trace24-btn-dark"
          style={{ padding: '10px 14px', fontSize: 12.5 }}
        >
          ใช้ token
        </div>
      </div>

      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid #E4E4E0', marginTop: 24, flexWrap: 'wrap' }}>
        {ADMIN_TABS.map(([key, label]) => {
          const active = adminTab === key;
          return (
            <div
              key={key}
              onClick={() => setAdminTab(key)}
              className="trace24-tab"
              style={{
                fontSize: 13.5,
                padding: '0 2px 12px',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? '#111110' : 'transparent'}`,
                color: active ? '#111110' : '#8B8B85',
                marginBottom: -1,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      {adminTab === 'crawl' && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 170px 110px 110px 90px',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #E4E4E0',
              fontSize: 11,
              color: '#8B8B85',
            }}
          >
            <div>แหล่งข้อมูล</div>
            <div>ประเภท</div>
            <div>สถานะ</div>
            <div>เก็บล่าสุด</div>
            <div>เอกสาร</div>
          </div>
          {dataset.sources.map((src, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 170px 110px 110px 90px',
                gap: 16,
                padding: '14px 0',
                borderBottom: '1px solid #EEEEEA',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontSize: 13.5 }}>{src.url}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{src.type}</div>
              <div style={{ fontSize: 12, color: src.ok ? '#55554F' : 'var(--accent)' }}>{src.status}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{src.last}</div>
              <div style={{ fontSize: 12.5 }}>{src.docs}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
            ตรวจแหล่งข้อมูลซ้ำทุก 24 ชม. — บันทึกเวลาดึงข้อมูลและค่าแฮชของไฟล์ทุกครั้ง
          </div>
        </div>
      )}

      {adminTab === 'queue' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', gap: 36, paddingBottom: 20, borderBottom: '1px solid #E4E4E0', flexWrap: 'wrap' }}>
            {(dataset.queueStats || []).map((qs, i) => (
              <div key={i}>
                <div style={{ fontSize: 22, fontWeight: 500 }}>{qs.n}</div>
                <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>{qs.label}</div>
              </div>
            ))}
            {(dataset.queueStats || []).length === 0 && (
              <div style={{ fontSize: 13.5, color: '#8B8B85' }}>ยังไม่มีสถิติคิวเอกสารในรายงานนี้</div>
            )}
          </div>
          {(dataset.queueRows || []).map((q, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 170px 100px 170px',
                gap: 16,
                padding: '14px 0',
                borderBottom: '1px solid #EEEEEA',
                alignItems: 'baseline',
              }}
            >
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.id}</div>
              <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.type}</div>
              <div style={{ fontSize: 12.5, color: '#55554F' }}>{q.fmt}</div>
              <div
                style={{
                  fontSize: 12,
                  color: q.ok === true ? '#55554F' : q.ok === false ? 'var(--accent)' : '#111110',
                }}
              >
                {q.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {adminTab === 'entities' && (
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#55554F', maxWidth: 680, lineHeight: 1.6 }}>
            การจับคู่ที่ไม่แน่นอนจะไม่ถูกรวมโดยอัตโนมัติ — การรวมผิดอาจสร้างความสัมพันธ์เท็จ ทุกการตัดสินใจด้านล่างถูกบันทึกพร้อมชื่อผู้ดำเนินการ
          </div>
          {(dataset.erRows || []).map((er) => {
            const dec = erDecisions[er.id];
            return (
              <div key={er.id} style={{ border: '1px solid #E4E4E0', background: '#fff', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{er.a}</div>
                  <div style={{ fontSize: 12, color: '#8B8B85' }}>≟</div>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{er.b}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontSize: 12, color: '#55554F' }}>ความคล้าย {er.sim}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {er.ev.map((ee) => (
                    <span key={ee} style={{ fontSize: 11.5, padding: '4px 10px', background: '#F6F6F3', color: '#55554F' }}>
                      {ee}
                    </span>
                  ))}
                </div>
                {!dec && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <div
                      onClick={() => setErDecision(er.id, 'รวมเป็นรายเดียวกัน')}
                      className="trace24-btn-dark"
                      style={{ padding: '9px 18px', fontSize: 12.5 }}
                    >
                      รวมเป็นรายเดียวกัน
                    </div>
                    <div
                      onClick={() => setErDecision(er.id, 'แยกไว้ต่างราย')}
                      style={{
                        border: '1px solid #C9C9C4',
                        padding: '9px 18px',
                        fontSize: 12.5,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      className="trace24-btn-outline"
                    >
                      แยกไว้ต่างราย
                    </div>
                  </div>
                )}
                {dec && (
                  <div style={{ marginTop: 16, fontSize: 12.5, color: '#55554F' }}>
                    บันทึกผลแล้ว: <span style={{ fontWeight: 600, color: '#111110' }}>{dec}</span> · ระบุชื่อผู้ตรวจ · ลงบันทึกตรวจสอบ
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adminTab === 'related' && (
        <div style={{ marginTop: 28, maxWidth: 860 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            ความเชื่อมโยงผู้บริหาร ↔ กรรมการ/ผู้ถือหุ้น
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#55554F', lineHeight: 1.6 }}>
            สังเกตความเชื่อมโยงจากนามสกุลเป็นหลัก (R13 เจ้าหน้าที่↔ผู้ชนะ · R5 ระหว่างผู้รับจ้าง) · ชื่อเต็มยกระดับความมั่นใจ ·
            ที่อยู่ร่วมยังตรวจแยก — นามสกุลตรงกันเป็น lead ไม่ใช่ข้อพิสูจน์
          </p>
          <RiskDisclaimer style={{ marginBottom: 16 }} />
          {relatedBusy && !relatedAnyBusy && (
            <LoadingHint label="กำลังโหลดความเชื่อมโยง" style={{ marginBottom: 12 }} />
          )}
          {relatedFetchBusy && (
            <LoadingHint
              label="กำลังดึงทำเนียบ/เจ้าหน้าที่จากเว็บ"
              hint="ดึงหน้า HTML แล้วให้ AI สกัดชื่อ — อาจใช้เวลาหลายวินาที"
              style={{ marginBottom: 12 }}
            />
          )}
          {relatedDirectorsBusy && (
            <LoadingHint
              label="กำลังดึงกรรมการจากหลายแหล่ง"
              hint="DataForThai → Creden → e-GP/เอกสารผู้ชนะ → DBD · ถ้าบล็อกให้วางข้อความจาก sourceUrl"
              style={{ marginBottom: 12 }}
            />
          )}
          {relatedAgeBusy && (
            <LoadingHint
              label="กำลังดึงวันจดทะเบียนจาก DataForThai"
              hint="เปิดหน้า dataforthai.com ตามเลขนิติบุคคลก่อน · ถ้าไม่เจอค่อยค้นเว็บ/ข่าว + AI — อาจใช้เวลาสักครู่"
              style={{ marginBottom: 12 }}
            />
          )}
          {relatedCoverage && (
            <div style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.55 }}>{relatedCoverage}</div>
          )}
          {relatedMatches.length > 0 && (
            <div style={{ marginBottom: 20, borderTop: '1px solid #111110' }}>
              {relatedMatches.map((m) => (
                <div
                  key={m.id}
                  style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA', fontSize: 13, lineHeight: 1.55 }}
                >
                  <span style={{ color: '#8B8B85', fontSize: 11, letterSpacing: '.04em' }}>
                    {m.ruleId} ·{' '}
                    {m.matchType === 'surname'
                      ? 'นามสกุล'
                      : m.matchType === 'full_name'
                        ? 'ชื่อเต็ม'
                        : m.matchType}{' '}
                    · {m.severity}
                  </span>
                  <div style={{ marginTop: 4 }}>{m.explanation}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: '#8B8B85', marginBottom: 8, lineHeight: 1.55 }}>
            ดึงทำเนียบ/เจ้าหน้าที่จากเว็บ · กรรมการไล่แหล่ง DataForThai → Creden → e-GP/เอกสารผู้ชนะ → DBD ·
            วันจดทะเบียนจาก DataForThai ·{' '}
            <a href="https://www.dataforthai.com/" target="_blank" rel="noreferrer" style={{ color: '#55554F' }}>
              dataforthai
            </a>
            {' · '}
            <a href="https://data.creden.co/" target="_blank" rel="noreferrer" style={{ color: '#55554F' }}>
              creden
            </a>
            {' · '}
            <a href="https://datawarehouse.dbd.go.th/" target="_blank" rel="noreferrer" style={{ color: '#55554F' }}>
              dbd
            </a>
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#8A5A1C',
              marginBottom: 12,
              lineHeight: 1.55,
              padding: '10px 12px',
              background: '#FBF7F0',
              border: '1px solid #E8DFD0',
            }}
          >
            ข้อมูลกรรมการ/ผู้ถือหุ้นมาจากแหล่งสาธารณะ — เป็น draft ให้ตรวจสอบกับแหล่งทางการ (DBD / บอจ.5)
            ก่อนใช้เป็นหลักฐาน
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={relatedExecUrl}
              onChange={(e) => setRelatedExecUrl(e.target.value)}
              placeholder="https://www.…go.th/ หน้าทำเนียบหรือหน้าแรก"
              style={{ ...inputStyle, flex: '1 1 280px', minWidth: 200 }}
            />
            <div
              onClick={relatedAnyBusy ? undefined : fetchExecutivesFromWeb}
              className="trace24-btn-outline"
              style={{
                padding: '10px 16px',
                fontSize: 13,
                opacity: relatedAnyBusy || !isRealAgency(scannedId) ? 0.55 : 1,
                cursor: relatedFetchBusy ? 'wait' : 'pointer',
                userSelect: 'none',
              }}
            >
              {relatedFetchBusy ? (
                <span className="trace24-btn-busy">
                  <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                  กำลังดึง
                </span>
              ) : (
                'ดึงทำเนียบ/เจ้าหน้าที่จากเว็บ'
              )}
            </div>
            <div
              onClick={relatedAnyBusy ? undefined : () => fetchDirectorsFromDbd('winners')}
              className="trace24-btn-outline"
              style={{
                padding: '10px 16px',
                fontSize: 13,
                opacity: relatedAnyBusy || !isRealAgency(scannedId) ? 0.55 : 1,
                cursor: relatedDirectorsBusy ? 'wait' : 'pointer',
                userSelect: 'none',
              }}
            >
              {relatedDirectorsBusy ? (
                <span className="trace24-btn-busy">
                  <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                  กำลังดึงหลายแหล่ง
                </span>
              ) : (
                'ดึงกรรมการ (หลายแหล่ง)'
              )}
            </div>
            <div
              onClick={relatedAnyBusy ? undefined : fetchCompanyAgeFromWeb}
              className="trace24-btn-outline"
              style={{
                padding: '10px 16px',
                fontSize: 13,
                opacity: relatedAnyBusy || !isRealAgency(scannedId) ? 0.55 : 1,
                cursor: relatedAgeBusy ? 'wait' : 'pointer',
                userSelect: 'none',
              }}
            >
              {relatedAgeBusy ? (
                <span className="trace24-btn-busy">
                  <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                  กำลังดึงวันจดทะเบียน
                </span>
              ) : (
                'ดึงวันจดทะเบียน (DataForThai)'
              )}
            </div>
          </div>
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              background: '#F6F6F3',
              border: '1px solid #E4E4E0',
            }}
          >
            <div style={{ fontSize: 12.5, color: '#55554F', marginBottom: 8, lineHeight: 1.5 }}>
              ถ้าเว็บบล็อกเซิร์ฟเวอร์: เปิดลิงก์ใน JSON (`sourceUrl` — DataForThai / Creden / DBD) → คัดลอกส่วนกรรมการ/ผู้ถือหุ้น
              (หรือจาก e-GP / เอกสารแนบผู้ชนะ / บอจ.5) มาวางที่นี่ → กดสกัด · ข้อมูลจากแหล่งสาธารณะ ตรวจกับแหล่งทางการอีกครั้ง
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                value={relatedDbdTin}
                onChange={(e) => setRelatedDbdTin(e.target.value)}
                placeholder="เลขนิติบุคคล 13 หลัก (ถ้ามี)"
                style={{ ...inputStyle, flex: '1 1 160px', minWidth: 140 }}
              />
              <input
                value={relatedDbdName}
                onChange={(e) => setRelatedDbdName(e.target.value)}
                placeholder="ชื่อบริษัท (ถ้ามี)"
                style={{ ...inputStyle, flex: '1 1 200px', minWidth: 160 }}
              />
            </div>
            <textarea
              value={relatedDbdPaste}
              onChange={(e) => setRelatedDbdPaste(e.target.value)}
              rows={4}
              placeholder="วางข้อความจาก DataForThai / Creden / DBD / บอจ.5 / เอกสารผู้ชนะ ที่นี่…"
              style={{
                ...inputStyle,
                width: '100%',
                fontSize: 12.5,
                lineHeight: 1.45,
                resize: 'vertical',
                boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            <div
              onClick={
                relatedAnyBusy || relatedDbdPaste.trim().length < 40
                  ? undefined
                  : () => fetchDirectorsFromDbd('paste')
              }
              className="trace24-btn-outline"
              style={{
                display: 'inline-block',
                padding: '9px 14px',
                fontSize: 12.5,
                opacity: relatedAnyBusy || relatedDbdPaste.trim().length < 40 ? 0.5 : 1,
                cursor: relatedDbdPaste.trim().length < 40 ? 'not-allowed' : 'pointer',
                userSelect: 'none',
              }}
            >
              สกัดกรรมการจากข้อความที่วาง
            </div>
          </div>
          <textarea
            value={relatedPackJson}
            onChange={(e) => setRelatedPackJson(e.target.value)}
            rows={18}
            spellCheck={false}
            style={{
              ...inputStyle,
              width: '100%',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.45,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
            placeholder='{"agencyId":"...","executives":[{"name":"นาย...","title":"ผู้อำนวยการ"}],"companies":[{"tin":"...","name":"...","directors":[{"name":"นาย...","role":"director"}]}]}'
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              onClick={saveRelatedPack}
              className="trace24-btn-dark"
              style={{ padding: '11px 18px', fontSize: 13, opacity: relatedBusy ? 0.6 : 1 }}
            >
              {relatedBusy ? '…' : 'บันทึกและตรวจจับคู่'}
            </div>
            <div style={{ fontSize: 12.5, color: '#8A5A1C', maxWidth: 520, lineHeight: 1.5 }}>
              {relatedMsg}
            </div>
          </div>
        </div>
      )}

      {adminTab === 'review' && (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '104px 1fr 100px 220px',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #E4E4E0',
              fontSize: 11,
              color: '#8B8B85',
            }}
          >
            <div>โครงการ</div>
            <div>สัญญาณ</div>
            <div>ระดับ</div>
            <div>สถานะการตรวจสอบ</div>
          </div>
          {(dataset.adminReviewRows || []).map((rr) => {
            const s = sev(rr.sevKey);
            return (
              <div
                key={rr.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '104px 1fr 100px 220px',
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: '1px solid #EEEEEA',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 12.5, color: '#55554F' }}>{rr.code}</div>
                <div style={{ fontSize: 13.5 }}>{rr.title}</div>
                <div>
                  <SeverityBadge label={s.sevLabel} color={s.sevColor} border={s.sevBorder} />
                </div>
                <select
                  value={reviewStates[rr.key] || rr.def}
                  onChange={(e) => setReviewState(rr.key, e.target.value)}
                  style={{ ...selectStyle, width: '100%', padding: '8px 10px', fontSize: 12.5 }}
                >
                  {REVIEW_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 14 }}>
            ผู้ตรวจสามารถเพิ่มบันทึก แก้ไขค่าที่สกัดได้ แนบหลักฐาน และส่งออกรายงานหลักฐาน — ทุกการกระทำถูกลงบันทึกตรวจสอบ
          </div>
        </div>
      )}

      {adminTab === 'case' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12.5, color: '#55554F' }}>{CF.id}</div>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '.06em',
                    padding: '3px 8px',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  {CF.status}
                </span>
              </div>
              <h2 style={{ fontSize: 21, fontWeight: 600, margin: '10px 0 6px', maxWidth: 720, lineHeight: 1.4 }}>
                {CF.title}
              </h2>
              <div style={{ fontSize: 12.5, color: '#8B8B85' }}>
                {CF.opened} · {CF.owner}
              </div>
            </div>
            <div
              className="trace24-btn-outline"
              style={{
                border: '1px solid #111110',
                padding: '11px 18px',
                fontSize: 13,
                cursor: 'pointer',
                userSelect: 'none',
                flex: 'none',
              }}
            >
              ส่งออกสำนวนหลักฐาน (PDF)
            </div>
          </div>
          <p
            style={{
              margin: '20px 0 0',
              padding: '18px 22px',
              background: '#F6F6F3',
              fontSize: 13.5,
              lineHeight: 1.7,
              color: '#26261F',
              maxWidth: 900,
              textWrap: 'pretty',
            }}
          >
            {CF.summary}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 48, marginTop: 36, alignItems: 'start' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>ไทม์ไลน์รวมของคดี</h2>
              <div style={{ marginTop: 16 }}>
                {CF.timeline.map((ct, i) => (
                  <div key={i} style={{ display: 'flex', gap: 0 }}>
                    <div style={{ width: 104, flex: 'none', fontSize: 12.5, color: '#8B8B85', padding: '2px 0 20px' }}>
                      {ct[0]}
                    </div>
                    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 18 }}>
                      <div style={{ width: 7, height: 7, background: '#111110', flex: 'none', marginTop: 5 }} />
                      <div style={{ width: 1, flex: 1, background: '#E4E4E0' }} />
                    </div>
                    <div style={{ padding: '0 0 20px', minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{ct[1]}</div>
                      <div
                        className="trace24-hover-text"
                        style={{
                          fontSize: 11.5,
                          color: '#8B8B85',
                          marginTop: 3,
                          cursor: 'pointer',
                          display: 'inline-block',
                        }}
                      >
                        {ct[2]} · ดูเอกสารต้นฉบับ ↗
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '36px 0 0' }}>คำถามที่ยังไม่มีคำตอบ</h2>
              <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
                {CF.questions.map((cq, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 20,
                      alignItems: 'baseline',
                      padding: '13px 0',
                      borderBottom: '1px solid #EEEEEA',
                    }}
                  >
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{cq[0]}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--accent)', flex: 'none', textAlign: 'right' }}>
                      {cq[1]}
                    </div>
                  </div>
                ))}
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '36px 0 0' }}>บันทึกของผู้ตรวจ</h2>
              <div style={{ marginTop: 14, borderTop: '1px solid #111110' }}>
                {caseNotes.map((cn, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 18,
                      padding: '12px 0',
                      borderBottom: '1px solid #EEEEEA',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ width: 80, flex: 'none', fontSize: 12, color: '#8B8B85' }}>{cn.date}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{cn.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <input
                  value={caseNote}
                  onChange={(e) => setCaseNote(e.target.value)}
                  placeholder="เพิ่มบันทึก — ถูกลงบันทึกตรวจสอบพร้อมชื่อผู้ตรวจ"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div
                  onClick={addCaseNote}
                  className="trace24-btn-dark"
                  style={{ padding: '11px 20px', fontSize: 13, flex: 'none' }}
                >
                  บันทึก
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>คู่กรณีและบุคคลที่เกี่ยวข้อง</h2>
                <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
                  {CF.parties.map((cp, i) => (
                    <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 13.5 }}>{cp[0]}</div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: cp[2] ? 'var(--accent)' : '#8B8B85',
                          marginTop: 3,
                          lineHeight: 1.5,
                        }}
                      >
                        {cp[1]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>เส้นทางเงิน</h2>
                <div style={{ marginTop: 12, borderTop: '1px solid #111110' }}>
                  {CF.money.map((cm, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid #EEEEEA',
                        alignItems: 'baseline',
                      }}
                    >
                      <div style={{ fontSize: 12.5, color: '#55554F', lineHeight: 1.5 }}>{cm[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: cm[2] ? 600 : 400, flex: 'none' }}>{cm[1]}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>แผนผังหลักฐาน</h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {CF.evidence.map((ce) => (
                    <span
                      key={ce}
                      className="trace24-chip"
                      style={{
                        fontSize: 11,
                        padding: '4px 9px',
                        border: '1px solid #DDDDD8',
                        color: '#55554F',
                        cursor: 'pointer',
                      }}
                    >
                      {ce} ↗
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 12, lineHeight: 1.6 }}>
                  {CF.signals}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#8B8B85', lineHeight: 1.55, fontStyle: 'italic' }}>
                คดีนี้เป็นสำนวนภายในสำหรับการตรวจสอบ — ไม่ใช่ข้อกล่าวหาต่อสาธารณะ ทุกการกระทำถูกลงบันทึกตรวจสอบ
              </div>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'pipeline' && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>สถาปัตยกรรมท่อข้อมูล TRACE24</h2>
          <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#55554F', maxWidth: 760, lineHeight: 1.6 }}>
            Source → Ingestion → Evidence → Extract/Normalise → DB/Graph → Detection → Risk → Alerts / Investigation Assistant
          </p>
          {!pipelineStatus && (
            <LoadingHint label="กำลังโหลดสถานะท่อข้อมูล" hint="อ่านสถาปัตยกรรมและสถานะเลเยอร์" />
          )}
          {pipelineStatus && (
            <>
              <div style={{ fontSize: 12, color: '#8B8B85', marginBottom: 14 }}>
                อัปเดต {pipelineStatus.generatedAt} · cache หน่วยงาน: {pipelineStatus.ingestion.cachedAgencies.join(', ') || '—'} · คำสั่ง: {pipelineStatus.ingestion.command}
                {' · '}vector passages {('totalPassages' in pipelineStatus.vector ? pipelineStatus.vector.totalPassages : 0) as number}
                {pipelineStatus.llm
                  ? ` · LLM ${pipelineStatus.llm.enabled ? pipelineStatus.llm.model : 'off'}`
                  : ''}
              </div>
              <div style={{ borderTop: '1px solid #111110' }}>
                {pipelineStatus.layers.map((layer) => (
                  <div
                    key={layer.layer}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '220px 100px 1fr',
                      gap: 16,
                      padding: '12px 0',
                      borderBottom: '1px solid #EEEEEA',
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ fontSize: 13.5 }}>{layer.layer}</div>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: '.04em',
                        color:
                          layer.status === 'live'
                            ? '#111110'
                            : layer.status === 'partial'
                              ? 'var(--accent)'
                              : '#8B8B85',
                      }}
                    >
                      {layer.status}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#55554F' }}>{layer.note}</div>
                  </div>
                ))}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Source Registry</h3>
              <div style={{ borderTop: '1px solid #111110' }}>
                {pipelineStatus.sources.map((src) => (
                  <div
                    key={src.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.8fr 1fr 100px',
                      gap: 14,
                      padding: '11px 0',
                      borderBottom: '1px solid #EEEEEA',
                      fontSize: 12.5,
                    }}
                  >
                    <div>{src.owner}</div>
                    <div style={{ color: '#55554F' }}>{src.kind}</div>
                    <div style={{ color: '#8B8B85', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.url}</div>
                    <div>{src.crawlerStatus}</div>
                  </div>
                ))}
              </div>
              {pipelineStatus.govApis && (
                <>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 8px' }}>Thai Gov APIs · เหมาะกับ TRACE24</h3>
                  <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#55554F', maxWidth: 760, lineHeight: 1.55 }}>
                    {pipelineStatus.govApis.mcpNote} · API: <code style={{ fontSize: 11 }}>/api/gov-apis</code>
                  </p>
                  {(
                    [
                      ['core', 'ใช้ได้แกน', pipelineStatus.govApis.core],
                      ['adjacent', 'บริบทเสริม', pipelineStatus.govApis.adjacent],
                      ['not_fit', 'ไม่เหมาะ / หน่วยงานเท่านั้น', pipelineStatus.govApis.notFit],
                    ] as const
                  ).map(([key, label, rows]) => (
                    <div key={key} style={{ marginBottom: 18 }}>
                      <div
                        style={{
                          fontSize: 12,
                          letterSpacing: '.04em',
                          marginBottom: 8,
                          color: key === 'core' ? '#111110' : key === 'adjacent' ? 'var(--accent)' : '#8B8B85',
                        }}
                      >
                        {label}
                      </div>
                      <div style={{ borderTop: '1px solid #111110' }}>
                        {((Array.isArray(rows) ? rows : []) as { id: string; nameTh?: string; owner?: string; access?: string; statusNote?: string; why?: string }[]).map((api) => (
                          <div
                            key={api.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.1fr 0.7fr 1.4fr 0.9fr',
                              gap: 12,
                              padding: '10px 0',
                              borderBottom: '1px solid #EEEEEA',
                              fontSize: 12.5,
                            }}
                          >
                            <div>
                              <div>{api.nameTh}</div>
                              <div style={{ fontSize: 11, color: '#8B8B85' }}>{api.owner}</div>
                            </div>
                            <div style={{ color: '#55554F' }}>{api.access}</div>
                            <div style={{ color: '#55554F' }}>{api.why}</div>
                            <div style={{ color: '#8B8B85', fontSize: 11.5 }}>{api.statusNote}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {adminTab === 'investigate' && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>ผู้ช่วยสอบสวน</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#55554F', maxWidth: 760, lineHeight: 1.6 }}>
            สำนวนจากหลักฐานสาธารณะ · กราฟความสัมพันธ์ · ข้อเท็จจริง / สัญญาณ / ข้อสรุป · Hybrid Graph RAG
          </p>
          <RiskDisclaimer style={{ marginBottom: 20, maxWidth: 760 }} />
          {packLoading && (
            <LoadingHint
              label="กำลังสร้างสำนวน"
              hint="รวบรวมหลักฐาน · สัญญาณ · กราฟความสัมพันธ์"
              style={{ marginBottom: 16, maxWidth: 480 }}
            />
          )}
          {llmBusy && !packLoading && (
            <LoadingHint
              label={
                llmBusy === 'review-signals'
                  ? 'กำลังทบทวนสัญญาณด้วย AI'
                  : llmBusy === 'propose-rules'
                    ? 'กำลังร่างกฎด้วย AI'
                    : llmBusy === 'refine-brief'
                      ? 'กำลังปรับสรุปสำนวนด้วย AI'
                      : 'กำลังประมวลผลด้วย AI'
              }
              hint="กฎความเสี่ยงยังมาจากระบบกฎเท่านั้น — AI ช่วยอ่านและจัดลำดับ"
              style={{ marginBottom: 16, maxWidth: 520 }}
            />
          )}
          {ragLoading && (
            <LoadingHint
              label="กำลังตอบคำถามจากหลักฐาน"
              hint="Hybrid Graph RAG"
              style={{ marginBottom: 16, maxWidth: 480 }}
            />
          )}
          {packError && <div style={{ fontSize: 13.5, color: 'var(--accent)' }}>{packError}</div>}
          {pack && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 36 }}>
              <div>
                <div style={{ fontSize: 12.5, color: '#8B8B85', marginBottom: 14, lineHeight: 1.55 }}>
                  {pack.architecture?.principle || 'Scores prioritize review — they never prove misconduct.'}
                </div>
                <div style={{ fontSize: 12.5, color: '#8B8B85', marginBottom: 14, lineHeight: 1.55 }}>
                  Vector {pack.vector.passages} · Claims {pack.claims?.length ?? 0} · Facts {pack.facts?.length ?? 0} · Missing {pack.missingInfo?.length ?? 0} · Graph edges {pack.graph.edges.length}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Hybrid Graph RAG</h3>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <input
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runRag()}
                    placeholder="เช่น ทำไมโครงการก่อสร้างถนนนี้จึงเสี่ยงสูง?"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <div
                    onClick={runRag}
                    className="trace24-btn-dark"
                    style={{ padding: '11px 18px', fontSize: 13, flex: 'none' }}
                  >
                    {ragLoading ? (
                      <span className="trace24-btn-busy">
                        <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                        ถาม
                      </span>
                    ) : (
                      'ถาม'
                    )}
                  </div>
                </div>
                {ragResult && (
                  <div style={{ padding: '14px 16px', background: '#F6F6F3', marginBottom: 22, fontSize: 12.5, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      ระดับจัดลำดับ: {ragResult.assessment?.riskLevel || '—'}
                      {ragResult.assessment?.score100 != null ? ` — ${ragResult.assessment.score100}/100` : ''}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{ragResult.answer}</div>
                    {(ragResult.facts?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>ข้อเท็จจริง</div>
                        {ragResult.facts.slice(0, 6).map((f) => (
                          <div key={f} style={{ color: '#55554F' }}>· {f}</div>
                        ))}
                      </div>
                    )}
                    {(ragResult.inferences?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>สัญญาณ (ไม่ใช่ข้อพิสูจน์)</div>
                        {ragResult.inferences.slice(0, 5).map((f) => (
                          <div key={f} style={{ color: '#55554F' }}>· {f}</div>
                        ))}
                      </div>
                    )}
                    {(ragResult.nextSteps?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>ขั้นตอนถัดไป</div>
                        {ragResult.nextSteps.map((s) => (
                          <div key={s} style={{ color: '#55554F' }}>- {s}</div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 10, color: '#8B8B85' }}>
                      citations {ragResult.citations.length} · graph nodes {ragResult.graphNodes.length} · rules {ragResult.ruleHits?.length || 0}
                      {ragResult.llm?.model ? ` · LLM ${ragResult.llm.model}` : ''}
                      {ragResult.llmError ? ` · LLM fallback: ${ragResult.llmError}` : ''}
                    </div>
                    {ragResult.assessment?.caveat && (
                      <div style={{ marginTop: 8, color: '#8A5A1C', fontSize: 12 }}>{ragResult.assessment.caveat}</div>
                    )}
                  </div>
                )}

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>LLM Assist</h3>
                <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#55554F', lineHeight: 1.55, maxWidth: 640 }}>
                  ช่วยประสิทธิภาพและความแม่นยำในการสอบสวน — คะแนนความเสี่ยงยังมาจากกฎเท่านั้น
                  {llmStatus
                    ? ` · ${llmStatus.enabled ? `พร้อม (${llmStatus.model})` : 'ยังไม่ตั้งค่า key'}`
                    : ''}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  {(
                    [
                      ['refine-brief', 'ปรับสำนวน'],
                      ['review-signals', 'ตรวจสัญญาณ'],
                      ['propose-rules', 'เสนอกฎใหม่'],
                    ] as const
                  ).map(([action, label]) => (
                    <div
                      key={action}
                      onClick={() => runLlmAction(action)}
                      className="trace24-btn-dark"
                      style={{
                        padding: '10px 14px',
                        fontSize: 12.5,
                        opacity: llmBusy ? 0.6 : 1,
                        pointerEvents: llmBusy ? 'none' : 'auto',
                      }}
                    >
                      {llmBusy === action ? (
                        <span className="trace24-btn-busy">
                          <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                          {label}
                        </span>
                      ) : (
                        label
                      )}
                    </div>
                  ))}
                </div>
                {llmError && (
                  <div style={{ fontSize: 12.5, color: 'var(--accent)', marginBottom: 12 }}>{llmError}</div>
                )}
                {llmBrief && (
                  <div style={{ padding: '14px 16px', background: '#F6F6F3', marginBottom: 14, fontSize: 12.5, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>สำนวนที่ปรับแล้ว · {llmBrief.model}</div>
                    <div>{llmBrief.refinedSummary}</div>
                    {llmBrief.prioritizedLeads.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        {llmBrief.prioritizedLeads.map((q) => (
                          <div key={q} style={{ padding: '4px 0' }}>
                            · {q}
                          </div>
                        ))}
                      </div>
                    )}
                    {llmBrief.accuracyNotes.length > 0 && (
                      <div style={{ marginTop: 10, color: '#55554F' }}>
                        {llmBrief.accuracyNotes.map((n) => (
                          <div key={n}>⚠ {n}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {llmReview && (
                  <div style={{ padding: '14px 16px', background: '#F6F6F3', marginBottom: 14, fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>ทบทวนสัญญาณ · {llmReview.model}</div>
                    <div style={{ marginBottom: 10 }}>{llmReview.summary}</div>
                    {llmReview.reviews.slice(0, 8).map((rv) => (
                      <div key={rv.signalId} style={{ padding: '8px 0', borderTop: '1px solid #EEEEEA' }}>
                        <div>
                          {rv.signalId} · {rv.likelyFalsePositive ? 'อาจเป็น false positive' : 'น่าสนใจต่อ'} · boost{' '}
                          {rv.priorityBoost}
                        </div>
                        <div style={{ color: '#55554F' }}>{rv.rationale}</div>
                        <div style={{ color: '#8B8B85' }}>ถามต่อ: {rv.followUpQuestion}</div>
                      </div>
                    ))}
                  </div>
                )}
                {llmRules && (
                  <div style={{ padding: '14px 16px', background: '#F6F6F3', marginBottom: 22, fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>ร่างกฎ (รออนุมัติ) · {llmRules.model}</div>
                    <div style={{ marginBottom: 10, color: '#55554F' }}>{llmRules.notes}</div>
                    {llmRules.proposals.map((p) => (
                      <div key={p.suggestedRuleId + p.title} style={{ padding: '8px 0', borderTop: '1px solid #EEEEEA' }}>
                        <div style={{ fontWeight: 500 }}>
                          {p.suggestedRuleId} · {p.title}
                        </div>
                        <div>{p.rationale}</div>
                        <div style={{ color: '#8B8B85' }}>threshold: {p.thresholdSketch}</div>
                        <div style={{ color: '#8B8B85' }}>features: {(p.featureHints || []).join(', ')}</div>
                      </div>
                    ))}
                  </div>
                )}

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Case Brief</h3>
                <div style={{ padding: '16px 18px', background: '#F6F6F3', marginBottom: 22 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{pack.caseBrief.title}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>{pack.caseBrief.summary}</div>
                  <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 12, lineHeight: 1.55 }}>
                    {pack.caseBrief.riskExplanation}
                  </div>
                  {pack.caseBrief.scoreDisclaimer && (
                    <div style={{ fontSize: 12, color: '#8A5A1C', marginTop: 10, lineHeight: 1.5 }}>
                      {pack.caseBrief.scoreDisclaimer}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: '#8B8B85', marginBottom: 8 }}>
                  คะแนนจัดลำดับการตรวจ · overall {pack.risk.overall} · project {pack.risk.project} · supplier {pack.risk.supplier} · network {pack.risk.network}
                  {' '}— ไม่ใช่คะแนนข้อกล่าวหา
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '18px 0 10px' }}>Key findings</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {pack.caseBrief.keyFindings.map((f) => (
                    <div key={f} style={{ padding: '10px 0', borderBottom: '1px solid #EEEEEA', fontSize: 13.5, lineHeight: 1.55 }}>
                      {f}
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>ข้อเท็จจริง (Fact)</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {(pack.facts || []).slice(0, 12).map((f) => (
                    <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #EEEEEA', fontSize: 13, lineHeight: 1.55 }}>
                      {f.statement}
                      <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 4 }}>
                        conf {f.confidence} · {f.observedAt || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>ช่องว่างข้อมูล (Missing information)</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {(pack.missingInfo || []).length === 0 && (
                    <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>ยังไม่พบช่องว่างที่เกินเกณฑ์</div>
                  )}
                  {(pack.missingInfo || []).map((g) => (
                    <div key={g.id} style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 13.5 }}>{g.expected}</div>
                      <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 4 }}>{g.observed}</div>
                      <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 4 }}>
                        coverage {(g.coverage * 100).toFixed(0)}% · gapScore {g.gapScore}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>ข้อสรุปเชิงวิเคราะห์ (Conclusion)</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {(pack.conclusions || []).map((c) => (
                    <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{c.statement}</div>
                      <div style={{ fontSize: 12, color: '#8A5A1C', marginTop: 6, lineHeight: 1.5 }}>{c.caveat}</div>
                      <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 8 }}>
                        ขั้นถัดไป: {c.recommendedNextSteps.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Investigation Leads</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {pack.leads.map((lead) => (
                    <div key={lead.id} style={{ padding: '14px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.5 }}>{lead.question}</div>
                        <SeverityBadge
                          label={sev(lead.priority).sevLabel}
                          color={sev(lead.priority).sevColor}
                          border={sev(lead.priority).sevBorder}
                        />
                      </div>
                      <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 6, lineHeight: 1.55 }}>{lead.why}</div>
                      <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 8 }}>
                        เอกสารที่ขาด: {lead.missingDocuments.join(' · ')}
                      </div>
                      <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 4 }}>
                        ขั้นถัดไป: {lead.nextActions.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Entity Resolution</h3>
                <div style={{ borderTop: '1px solid #111110', marginBottom: 24, maxHeight: 220, overflow: 'auto' }}>
                  {pack.entityClusters.slice(0, 12).map((c) => (
                    <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 13 }}>{c.canonical}</div>
                      <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>
                        {c.type} · aliases {c.aliases.length} · conf {c.confidence}
                      </div>
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Evidence Map / Provenance</h3>
                <div style={{ borderTop: '1px solid #111110', maxHeight: 520, overflow: 'auto' }}>
                  {pack.evidenceMap.slice(0, 24).map((ev) => (
                    <div key={ev.id} style={{ padding: '11px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 11.5, color: '#8B8B85' }}>
                        {ev.when} · {ev.kind}
                        {ev.checksumSha256 ? ` · sha256 ${ev.checksumSha256.slice(0, 12)}…` : ''}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{ev.label}</div>
                      {ev.extractionMethod && (
                        <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>
                          extract: {ev.extractionMethod}
                          {ev.confidence != null ? ` · conf ${ev.confidence}` : ''}
                        </div>
                      )}
                      {ev.url && (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 4, display: 'inline-block' }}
                        >
                          แหล่งต้นทาง ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Alerts / Signals</h3>
                <div style={{ borderTop: '1px solid #111110' }}>
                  {pack.alerts.length === 0 && (
                    <div style={{ padding: '12px 0', fontSize: 13, color: '#8B8B85' }}>ยังไม่มี alert ระดับสูง</div>
                  )}
                  {pack.alerts.map((a) => (
                    <div key={a.id} style={{ padding: '11px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 13.5 }}>{a.title}</div>
                        <SeverityBadge
                          label={sev(a.severity).sevLabel}
                          color={sev(a.severity).sevColor}
                          border={sev(a.severity).sevBorder}
                        />
                      </div>
                      <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 5, lineHeight: 1.55 }}>{a.body}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Feedback สัญญาณ (สำหรับ Rule Proposer)</h3>
                <div style={{ borderTop: '1px solid #111110', maxHeight: 280, overflow: 'auto' }}>
                  {pack.risk.signals.slice(0, 10).map((s) => (
                    <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid #EEEEEA' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{s.ruleId} · {s.title}</div>
                      <div style={{ fontSize: 11.5, color: '#8B8B85', marginTop: 3 }}>{s.explanation.slice(0, 140)}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {(
                          [
                            ['confirmed', 'ยืนยัน'],
                            ['false_positive', 'False +'],
                            ['needs_data', 'ข้อมูลไม่พอ'],
                          ] as const
                        ).map(([label, text]) => (
                          <div
                            key={label}
                            onClick={() => sendSignalFeedback(s.id, s.ruleId, label)}
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              border: '1px solid #C9C9C4',
                              cursor: 'pointer',
                              color: '#55554F',
                            }}
                          >
                            {text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '28px 0 10px' }}>Source citations</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pack.caseBrief.sourceCitations.slice(0, 16).map((c) => (
                    <span
                      key={c}
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        border: '1px solid #DDDDD8',
                        color: '#55554F',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {adminTab === 'rules' && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>LLM Rule Proposer</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#55554F', maxWidth: 760, lineHeight: 1.6 }}>
            กิน investigation pack + feedback จาก Admin → ร่างกฎ JSON → คนกดอนุมัติก่อนเข้า detection
            (กฎที่อนุมัติแล้วรันผ่าน <code style={{ fontSize: 12 }}>runApprovedDynamicRules</code> ไม่แก้ severity โดย LLM โดยตรง)
          </p>
          {ruleFbSummary && (
            <div style={{ fontSize: 12.5, color: '#8B8B85', marginBottom: 14 }}>
              Feedback · confirmed {ruleFbSummary.confirmed} · false+ {ruleFbSummary.falsePositive} · needs data{' '}
              {ruleFbSummary.needsData} · รวม {ruleFbSummary.total}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div
              onClick={() => runLlmAction('propose-rules')}
              className="trace24-btn-dark"
              style={{ padding: '11px 16px', fontSize: 13, opacity: llmBusy ? 0.6 : 1 }}
            >
              {llmBusy === 'propose-rules' ? (
                <span className="trace24-btn-busy">
                  <span className="trace24-scan-spin trace24-scan-spin--sm" aria-hidden />
                  กำลังร่าง
                </span>
              ) : (
                'ร่างกฎจากหน่วยงานปัจจุบัน'
              )}
            </div>
            {!isRealAgency(scannedId) && (
              <div style={{ fontSize: 12.5, color: 'var(--accent)', alignSelf: 'center' }}>
                สแกนหน่วยงานข้อมูลจริงก่อน (เช่น โพทะเล)
              </div>
            )}
          </div>
          {rulesMsg && <div style={{ fontSize: 12.5, color: '#55554F', marginBottom: 12 }}>{rulesMsg}</div>}
          {llmError && <div style={{ fontSize: 12.5, color: 'var(--accent)', marginBottom: 12 }}>{llmError}</div>}
          {rulesLoading && <LoadingHint label="กำลังโหลดคิวดร่างกฎ" style={{ marginBottom: 12 }} />}
          <div style={{ borderTop: '1px solid #111110' }}>
            {ruleRows.length === 0 && !rulesLoading && (
              <div style={{ padding: '14px 0', fontSize: 13, color: '#8B8B85' }}>ยังไม่มีร่างกฎ — กด「ร่างกฎจากหน่วยงานปัจจุบัน」</div>
            )}
            {ruleRows.map((r) => (
              <div key={r.id} style={{ padding: '16px 0', borderBottom: '1px solid #EEEEEA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {r.suggestedRuleId} · {r.title}
                  </div>
                  <div style={{ fontSize: 11, letterSpacing: '.04em', color: r.status === 'approved' ? '#111110' : r.status === 'rejected' ? '#8B8B85' : 'var(--accent)' }}>
                    {r.status}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: '#55554F', marginTop: 6, lineHeight: 1.55 }}>{r.rationale}</div>
                <div style={{ fontSize: 12, color: '#8B8B85', marginTop: 6 }}>
                  threshold: {r.thresholdSketch}
                  {r.executable ? ` · executable: ${r.executable.kind}` : ' · advisory only (ยังไม่มี executable)'}
                  {' · '}
                  {r.agencyId} · {r.model}
                </div>
                {r.status === 'draft' && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <div
                      onClick={() => decideRule(r.id, 'approved')}
                      className="trace24-btn-dark"
                      style={{ padding: '8px 14px', fontSize: 12.5 }}
                    >
                      อนุมัติเข้า detect
                    </div>
                    <div
                      onClick={() => decideRule(r.id, 'rejected')}
                      style={{
                        padding: '8px 14px',
                        fontSize: 12.5,
                        border: '1px solid #C9C9C4',
                        cursor: 'pointer',
                      }}
                    >
                      ปฏิเสธ
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
