'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { findAgency, isRealAgency, type AgencyRecord } from '@/lib/agencies';
import { C, D, H } from '@/lib/data';

export type Trace24Dataset = Omit<typeof D, 'munis' | 'reviewOptions'> & {
  agency?: AgencyRecord;
};

export type Page =
  | 'home'
  | 'scan'
  | 'dashboard'
  | 'project'
  | 'contractor'
  | 'graph'
  | 'admin'
  | 'method'
  | 'sources'
  | 'corrections'
  | 'about';

export type AdminTab =
  | 'crawl'
  | 'queue'
  | 'entities'
  | 'review'
  | 'case'
  | 'pipeline'
  | 'investigate'
  | 'rules';
export type GraphLayer = 'country' | 'cluster' | 'entity';
export type GraphFilter = 'all' | 'company' | 'projectNode' | 'people' | 'doc';

type Trace24State = {
  page: Page;
  query: string;
  selMuniId: string | null;
  selAgency: AgencyRecord | null;
  scannedId: string | null;
  scanStep: number;
  selProjectId: string;
  selContractorId: string;
  selNodeId: string;
  graphFilter: GraphFilter;
  graphLayer: GraphLayer;
  adminTab: AdminTab;
  erDecisions: Record<string, string>;
  reviewStates: Record<string, string>;
  projectReview: Record<string, string>;
  caseNote: string;
  caseNotesAdded: Record<string, [string, string][]>;
  corrType: string;
  corrRef: string;
  corrDetail: string;
  corrEmail: string;
  corrSent: boolean;
  liveDataset: Trace24Dataset | null;
  datasetLoading: boolean;
  datasetError: string | null;
};

type Trace24ContextValue = Trace24State & {
  muni: AgencyRecord;
  dataset: Trace24Dataset;
  go: (page: Page, extra?: Partial<Trace24State>) => void;
  setQuery: (query: string) => void;
  selectMuni: (id: string, agency?: AgencyRecord | null) => void;
  clearSel: () => void;
  startScan: () => void;
  setSelProjectId: (id: string) => void;
  setSelContractorId: (id: string) => void;
  setSelNodeId: (id: string) => void;
  setGraphFilter: (f: GraphFilter) => void;
  setGraphLayer: (l: GraphLayer) => void;
  setAdminTab: (t: AdminTab) => void;
  setProjectReview: (projectId: string, value: string) => void;
  setErDecision: (id: string, decision: string) => void;
  setReviewState: (key: string, value: string) => void;
  setCaseNote: (note: string) => void;
  addCaseNote: () => void;
  setCorrType: (v: string) => void;
  setCorrRef: (v: string) => void;
  setCorrDetail: (v: string) => void;
  setCorrEmail: (v: string) => void;
  submitCorr: () => void;
  resetCorr: () => void;
};

const Trace24Context = createContext<Trace24ContextValue | null>(null);

const INITIAL: Trace24State = {
  page: 'home',
  query: '',
  selMuniId: null,
  selAgency: null,
  scannedId: null,
  scanStep: -1,
  selProjectId: 'p14',
  selContractorId: 'c1',
  selNodeId: 'c1',
  graphFilter: 'all',
  graphLayer: 'entity',
  adminTab: 'crawl',
  erDecisions: {},
  reviewStates: {},
  projectReview: {},
  caseNote: '',
  caseNotesAdded: {},
  corrType: 'ข้อมูลที่สกัดไม่ถูกต้อง',
  corrRef: '',
  corrDetail: '',
  corrEmail: '',
  corrSent: false,
  liveDataset: null,
  datasetLoading: false,
  datasetError: null,
};

function mockDataset(id: string | null): Trace24Dataset {
  return (id === 'm9' ? H : D) as Trace24Dataset;
}

export function Trace24Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Trace24State>(INITIAL);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      fetchRef.current?.abort();
    };
  }, []);

  const go = useCallback((page: Page, extra?: Partial<Trace24State>) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState((s) => ({ ...s, page, ...extra }));
    window.scrollTo(0, 0);
  }, []);

  const muni = useMemo(() => {
    const id = state.scannedId ?? state.selMuniId ?? 'm1';
    const fromLive = state.liveDataset?.agency as AgencyRecord | undefined;
    if (fromLive?.id === id) return fromLive;
    return (
      findAgency(id, D.munis as AgencyRecord[], state.selAgency) ??
      (D.munis[0] as AgencyRecord)
    );
  }, [state.scannedId, state.selMuniId, state.selAgency, state.liveDataset]);

  const dataset = useMemo(() => {
    if (state.liveDataset) return state.liveDataset;
    return mockDataset(state.scannedId);
  }, [state.scannedId, state.liveDataset]);

  const beginScanAnimation = useCallback((stageCount: number, extra: Partial<Trace24State>) => {
    setState((s) => ({ ...s, page: 'scan', scanStep: 0, ...extra }));
    window.scrollTo(0, 0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setState((s) => {
        const n = s.scanStep + 1;
        if (n >= stageCount && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return { ...s, scanStep: Math.min(n, stageCount) };
      });
    }, 600);
  }, []);

  const startScan = useCallback(() => {
    const id = state.selMuniId;
    if (!id) return;

    if (timerRef.current) clearInterval(timerRef.current);
    fetchRef.current?.abort();

    // Catalog / curated agencies → live report (cached or registry stub)
    if (isRealAgency(id) || state.selAgency?.id === id) {
      const controller = new AbortController();
      fetchRef.current = controller;

      setState((s) => ({
        ...s,
        page: 'scan',
        scanStep: -1,
        scannedId: id,
        liveDataset: null,
        datasetLoading: true,
        datasetError: null,
        graphFilter: 'all',
        graphLayer: 'entity',
      }));
      window.scrollTo(0, 0);

      fetch(`/api/agencies/${encodeURIComponent(id)}/report`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          return res.json() as Promise<Trace24Dataset>;
        })
        .then((data) => {
          const projectIds = Object.keys(data.projects || {});
          const contractorIds = Object.keys(data.contractors || {});
          const extra: Partial<Trace24State> = {
            scannedId: id,
            liveDataset: data,
            datasetLoading: false,
            datasetError: null,
            selProjectId: data.def?.project || projectIds[0] || '',
            selContractorId: data.def?.contractor || contractorIds[0] || '',
            selNodeId: data.def?.node || 'muni',
            selAgency: (data.agency as AgencyRecord) || state.selAgency,
          };
          beginScanAnimation(data.stages?.length ?? 7, extra);
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return;
          setState((s) => ({
            ...s,
            datasetLoading: false,
            datasetError: e.message || 'โหลดข้อมูลไม่สำเร็จ',
            scanStep: -1,
          }));
        });
      return;
    }

    const ds = mockDataset(id);
    const extra: Partial<Trace24State> = {
      scannedId: id,
      liveDataset: null,
      datasetLoading: false,
      datasetError: null,
      selProjectId: ds.def.project,
      selContractorId: ds.def.contractor,
      selNodeId: ds.def.node,
      graphFilter: 'all',
      graphLayer: 'entity',
    };
    beginScanAnimation(ds.stages.length, extra);
  }, [state.selMuniId, state.selAgency, beginScanAnimation]);

  const value: Trace24ContextValue = {
    ...state,
    muni,
    dataset,
    go,
    setQuery: (query) =>
      setState((s) => ({
        ...s,
        query,
        selMuniId: null,
        selAgency: null,
        liveDataset: null,
        datasetError: null,
      })),
    selectMuni: (id, agency = null) =>
      setState((s) => ({
        ...s,
        selMuniId: id,
        selAgency: agency ?? s.selAgency,
        query: '',
        liveDataset: null,
        datasetError: null,
      })),
    clearSel: () => setState((s) => ({ ...s, selMuniId: null, selAgency: null })),
    startScan,
    setSelProjectId: (id) => setState((s) => ({ ...s, selProjectId: id })),
    setSelContractorId: (id) => setState((s) => ({ ...s, selContractorId: id })),
    setSelNodeId: (id) => setState((s) => ({ ...s, selNodeId: id })),
    setGraphFilter: (f) => setState((s) => ({ ...s, graphFilter: f })),
    setGraphLayer: (l) => setState((s) => ({ ...s, graphLayer: l })),
    setAdminTab: (t) => setState((s) => ({ ...s, adminTab: t })),
    setProjectReview: (projectId, value) =>
      setState((s) => ({
        ...s,
        projectReview: { ...s.projectReview, [projectId]: value },
      })),
    setErDecision: (id, decision) =>
      setState((s) => ({
        ...s,
        erDecisions: { ...s.erDecisions, [id]: decision },
      })),
    setReviewState: (key, value) =>
      setState((s) => ({
        ...s,
        reviewStates: { ...s.reviewStates, [key]: value },
      })),
    setCaseNote: (note) => setState((s) => ({ ...s, caseNote: note })),
    addCaseNote: () => {
      const v = state.caseNote.trim();
      if (!v) return;
      const caseId = dataset.caseFile.id;
      setState((s) => ({
        ...s,
        caseNote: '',
        caseNotesAdded: {
          ...s.caseNotesAdded,
          [caseId]: [
            ['วันนี้', `${v} — บันทึกโดยผู้ตรวจ (คุณ)`],
            ...(s.caseNotesAdded[caseId] ?? []),
          ],
        },
      }));
    },
    setCorrType: (v) => setState((s) => ({ ...s, corrType: v })),
    setCorrRef: (v) => setState((s) => ({ ...s, corrRef: v })),
    setCorrDetail: (v) => setState((s) => ({ ...s, corrDetail: v })),
    setCorrEmail: (v) => setState((s) => ({ ...s, corrEmail: v })),
    submitCorr: () => setState((s) => ({ ...s, corrSent: true })),
    resetCorr: () =>
      setState((s) => ({
        ...s,
        corrSent: false,
        corrRef: '',
        corrDetail: '',
        corrEmail: '',
      })),
  };

  return (
    <Trace24Context.Provider value={value}>{children}</Trace24Context.Provider>
  );
}

export function useTrace24() {
  const ctx = useContext(Trace24Context);
  if (!ctx) throw new Error('useTrace24 must be used within Trace24Provider');
  return ctx;
}

export { C, D };
