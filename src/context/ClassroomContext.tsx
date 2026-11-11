import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  AppData,
  ActiveTab,
  Student,
  Assessment,
  ToastItem,
  ConfirmDialogOptions,
  PromptDialogOptions
} from '../types';
import {
  todayKey,
  dateKey,
  getMonthDays,
  getSortedStudents,
  esc,
  TBL_SIZES
} from '../utils/helpers';
import { normalizeData, makeBaseData } from '../utils/migrate';
import { getStorage, isStorageFallbackActive } from '../storage';
import { maybeTriggerAutoBackup } from '../storage/autoBackup';
import { App as CapApp } from '@capacitor/app';


const ALL_TABS: ActiveTab[] = ["dashboard", "students", "attendance", "dailytest", "results", "funds", "view", "settings"];

// Decided ONCE per page load: a brand-new session always opens on the Dashboard,
// a refresh inside the same session restores the last tab.
const INITIAL_TAB: ActiveTab = (() => {
  try {
    const isRefresh = sessionStorage.getItem("classroomSessionActive") === "1";
    let tab: ActiveTab = "dashboard";
    if (isRefresh) {
      const saved = localStorage.getItem("classroomTab") as ActiveTab;
      tab = ALL_TABS.includes(saved) ? saved : "dashboard";
    } else {
      sessionStorage.setItem("classroomSessionActive", "1");
    }
    localStorage.setItem("classroomTab", tab);
    return tab;
  } catch {
    return "dashboard";
  }
})();


interface ClassroomContextType {
  data: AppData;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeAssessmentId: string | null;
  setActiveAssessmentId: (id: string | null) => void;
  activeFundId: string | null;
  setActiveFundId: (id: string | null) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  tableSizeLevel: number;
  changeTableSize: (delta: number) => void;
  saveData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  quickSaveData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  flushSave: () => void;
  replaceAllData: (raw: unknown) => void;
  resetEverything: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  toasts: ToastItem[];
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  isSavedFlashing: boolean;
  uiConfirm: (message: string, opts?: ConfirmDialogOptions) => Promise<boolean>;
  uiPrompt: (message: string, defaultValue?: string, opts?: PromptDialogOptions) => Promise<string | null>;
  closeConfirm: (val?: boolean) => void;
  closePrompt: (val?: string | null) => void;
  confirmState: {
    isOpen: boolean;
    message: string;
    opts: ConfirmDialogOptions;
    resolve: ((val: boolean) => void) | null;
  };
  promptState: {
    isOpen: boolean;
    message: string;
    defaultValue: string;
    opts: PromptDialogOptions;
    resolve: ((val: string | null) => void) | null;
  };
  helpModalOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  infoModal: {
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
  };
  showInfoModal: (title: string, content: React.ReactNode) => void;
  closeInfoModal: () => void;
  // Calculations
  isTodayAttendanceTaken: () => boolean;
  countDay: (dateKey: string) => {
    total: number;
    present: number;
    absent: number;
    leave: number;
    holiday: boolean;
    taken: boolean;
    locked: boolean;
  };
  studentMonthStats: (student: Student, monthKey: string) => {
    p: number;
    a: number;
    l: number;
    h: number;
    pct: number;
  };
  classAttendanceForMonth: (monthKey: string) => {
    p: number;
    a: number;
    denom: number;
    pct: number;
  };
  classAttendanceThisMonth: () => {
    p: number;
    a: number;
    denom: number;
    pct: number;
  };
  calcAssessmentResult: (student: Student, assessment: Assessment) => {
    total: number;
    maxTotal: number;
    pct: number;
    computedPass: boolean;
    passed: boolean;
    manual: boolean;
    subMarks: Array<{ subId: string; mark: number; max: number; below33: boolean }>;
    anyBelow33: boolean;
  };
  computeAssessmentRanking: (asmtId: string) => Array<{
    s: Student;
    r: ReturnType<ClassroomContextType['calcAssessmentResult']>;
    rank: number;
  }>;
  assessmentEntryCount: (asmtId: string) => number;
  computeFundStats: (fundId: string) => {
    collected: number;
    pending: number;
    paid: number;
    partial: number;
    pend: number;
    exempt: number;
    overpaidTotal: number;
    totalStudentsCounted: number;
    totalTarget: number;
    pct: number;
    totalStudents: number;
    variable: boolean;
  };
  getFundStudentStatus: (fundId: string, sid: string) => {
    code: 'PAID' | 'PARTIAL' | 'PENDING' | 'EXEMPT';
    amount: number;
    target: number;
    pct: number;
    exempt?: boolean;
    overpaid?: boolean;
    variable: boolean;
  };
  classFundsSummary: () => {
    collected: number;
    target: number;
    pct: number;
    paidCount: number;
    totalCounted: number;
    fundCount: number;
  };
  classAverageForAssessment: (asmtId: string) => {
    avg: number;
    passRate: number;
    entered: number;
    passed: number;
    total: number;
  } | null;
  buildPrintHeaderHTML: (title?: string, subline?: string) => string;
  isHydrated: boolean;
}

const ClassroomContext = createContext<ClassroomContextType | null>(null);

export const ClassroomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const isHydratedRef = useRef<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [loadAttempt, setLoadAttempt] = useState<number>(0);
  const [data, setData] = useState<AppData>(() => makeBaseData());
  const [activeTab, setActiveTabState] = useState<ActiveTab>(INITIAL_TAB);
  const [activeAssessmentId, setActiveAssessmentIdState] = useState<string | null>(() => {
    return localStorage.getItem("classroomActiveAssessment") || null;
  });
  const [activeFundId, setActiveFundIdState] = useState<string | null>(() => {
    return localStorage.getItem("classroomActiveFund") || null;
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("classroomDark") === "1";
  });

  const [tableSizeLevel, setTableSizeLevel] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem("classroomTblSize") || "2", 10);
    return saved >= 0 && saved < TBL_SIZES.length ? saved : 2;
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSavedFlashing, setIsSavedFlashing] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; content: React.ReactNode }>({
    isOpen: false,
    title: "",
    content: null
  });

  const flashSaved = useCallback(() => {
    setIsSavedFlashing(true);
    setTimeout(() => setIsSavedFlashing(false), 700);
  }, []);

  // Modal dialog states
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    opts: ConfirmDialogOptions;
    resolve: ((val: boolean) => void) | null;
  }>({
    isOpen: false,
    message: "",
    opts: {},
    resolve: null
  });

  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    message: string;
    defaultValue: string;
    opts: PromptDialogOptions;
    resolve: ((val: string | null) => void) | null;
  }>({
    isOpen: false,
    message: "",
    defaultValue: "",
    opts: {},
    resolve: null
  });

  // Undo / Redo Stacks & Async Persistence References
  const historyStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const lastSavedStateRef = useRef<string>(JSON.stringify(makeBaseData()));
  const dataRef = useRef<AppData>(data);
  const pendingSaveDataRef = useRef<AppData | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const writeQueueTailRef = useRef<Promise<void>>(Promise.resolve());
  const [, setHistoryVersion] = useState(0);
  const bumpHistory = useCallback(() => setHistoryVersion(v => v + 1), []);

  // Apply dark mode & table zoom CSS variables
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("classroomDark", darkMode ? "1" : "0");
  }, [darkMode]);

  useEffect(() => {
    const s = TBL_SIZES[tableSizeLevel] || TBL_SIZES[2];
    document.documentElement.style.setProperty("--tbl-fs", `${s.fs}px`);
    document.documentElement.style.setProperty("--tbl-pad", `${s.pad}px`);
    document.documentElement.style.setProperty("--tbl-input-fs", `${s.inp}px`);
    localStorage.setItem("classroomTblSize", String(tableSizeLevel));
  }, [tableSizeLevel]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    localStorage.setItem("classroomTab", tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // If the last-open tab belongs to a hidden tool, open Home instead
  useEffect(() => {
    if (!isHydrated) return;
    const tools = data.tools;
    if (!tools) return;
    if (activeTab === 'attendance' && !tools.attendance) {
      setActiveTab('dashboard');
    } else if (activeTab === 'results' && !tools.results) {
      setActiveTab('dashboard');
    } else if (activeTab === 'dailytest' && !tools.dailyTest) {
      setActiveTab('dashboard');
    } else if (activeTab === 'funds' && !tools.funds) {
      setActiveTab('dashboard');
    }
  }, [data.tools, activeTab, isHydrated, setActiveTab]);

  const setActiveAssessmentId = useCallback((id: string | null) => {
    setActiveAssessmentIdState(id);
    if (id) {
      localStorage.setItem("classroomActiveAssessment", id);
    } else {
      localStorage.removeItem("classroomActiveAssessment");
    }
  }, []);

  const setActiveFundId = useCallback((id: string | null) => {
    setActiveFundIdState(id);
    if (id) {
      localStorage.setItem("classroomActiveFund", id);
    } else {
      localStorage.removeItem("classroomActiveFund");
    }
  }, []);

  const toggleDarkMode = useCallback(() => {
    const next = !darkMode;
    setDarkMode(next);
    toast(next ? "Dark mode on" : "Light mode on", "info");
  }, [darkMode, toast]);

  const changeTableSize = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(TBL_SIZES.length - 1, tableSizeLevel + delta));
    if (next === tableSizeLevel) return;
    setTableSizeLevel(next);
    toast(`Table size: ${TBL_SIZES[next].label}`, "info");
  }, [tableSizeLevel, toast]);

  const cloneData = (d: AppData): AppData => JSON.parse(JSON.stringify(d));
  // Undo/redo snapshots leave the (large) school logo out; the current logo is re-attached on restore.
  const snapshotOf = (d: AppData): string => JSON.stringify({ ...d, schoolLogo: '' });

  // Drains the pending save into an ordered, serial write queue to SQLite / WebStorage
  const flushPendingToStorage = useCallback((): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const toSave = pendingSaveDataRef.current;
    if (!toSave || !isHydratedRef.current) {
      return writeQueueTailRef.current;
    }

    pendingSaveDataRef.current = null;

    writeQueueTailRef.current = writeQueueTailRef.current
      .then(async () => {
        const storage = await getStorage();
        await storage.saveAppData(toSave);
        // Automatic safety backup (max once per 24 hours, non-blocking)
        maybeTriggerAutoBackup(toSave).catch((err) => {
          console.warn('[ClassroomContext] Auto-backup notice:', err);
        });
      })
      .catch((err) => {
        console.error('[ClassroomContext] Storage save error:', err);
        toast("Storage save failed. Check storage capacity.", "error");
      });

    return writeQueueTailRef.current;
  }, [toast]);

  // Debounces writes (~350ms) while guaranteeing they are committed in order
  const schedulePersist = useCallback((dataToPersist: AppData, immediate = false) => {
    if (!isHydratedRef.current) return;
    pendingSaveDataRef.current = dataToPersist;

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (immediate) {
      flushPendingToStorage();
    } else {
      debounceTimerRef.current = window.setTimeout(() => {
        flushPendingToStorage();
      }, 350);
    }
  }, [flushPendingToStorage]);

  // Flush queue on app pause / backgrounding (Android Capacitor pause, Web visibilitychange/beforeunload)
  useEffect(() => {
    const onFlush = () => {
      flushPendingToStorage();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onFlush();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onFlush);

    let pauseSub: any = null;
    let appStateSub: any = null;
    try {
      CapApp.addListener('pause', onFlush).then(s => { pauseSub = s; }).catch(() => {});
      CapApp.addListener('appStateChange', (state) => {
        if (!state.isActive) {
          onFlush();
        }
      }).then(s => { appStateSub = s; }).catch(() => {});
    } catch {
      // Non-native platform
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onFlush);
      if (pauseSub && typeof pauseSub.remove === 'function') pauseSub.remove();
      if (appStateSub && typeof appStateSub.remove === 'function') appStateSub.remove();
    };
  }, [flushPendingToStorage]);

  // Async Startup Hydration: loads from SQLite (on Android) or WebStorage (on Web/PWA)
  useEffect(() => {
    let isMounted = true;

    async function initStorageAndLoad() {
      try {
        const storage = await getStorage();
        const loaded = await storage.loadAppData();
        const normalized = loaded ? normalizeData(loaded) : makeBaseData();

        if (isMounted) {
          dataRef.current = normalized;
          lastSavedStateRef.current = snapshotOf(normalized);
          setData(normalized);
          isHydratedRef.current = true;
          setIsHydrated(true);

          if (isStorageFallbackActive()) {
            toast("SQLite storage unavailable. Using web storage fallback.", "info");
          }
        }
      } catch (err) {
        // IMPORTANT: do NOT continue with empty defaults here. The next save would
        // overwrite the real (unreadable) records. Show a retry screen instead.
        console.error('[ClassroomContext] Storage initialization error:', err);
        if (isMounted) {
          isHydratedRef.current = false;
          setLoadError(true);
        }
      }
    }

    setLoadError(false);
    initStorageAndLoad();

    return () => {
      isMounted = false;
    };
  }, [toast, loadAttempt]);

  // Last resort from the error screen: start with empty records (after a confirmation).
  const startFreshAfterLoadError = useCallback(() => {
    const ok = window.confirm(
      'Start with empty records?\n\nThis replaces the records that could not be opened. Only do this if Retry keeps failing and you have a backup file to import.'
    );
    if (!ok) return;
    const fresh = makeBaseData();
    dataRef.current = fresh;
    lastSavedStateRef.current = snapshotOf(fresh);
    setData(fresh);
    isHydratedRef.current = true;
    setIsHydrated(true);
    setLoadError(false);
  }, []);

  // Save with Undo tracking.
  // The updater receives a private deep copy, so it can never mutate the live state.
  const saveData = useCallback((updater: AppData | ((prev: AppData) => AppData)) => {
    if (!isHydratedRef.current) {
      console.warn('[ClassroomContext] Ignored saveData before storage hydration completed.');
      return;
    }

    const base = cloneData(dataRef.current);
    const next = typeof updater === 'function' ? updater(base) : updater;
    const nextStr = snapshotOf(next);

    if (nextStr !== lastSavedStateRef.current) {
      historyStackRef.current.push(lastSavedStateRef.current);
      if (historyStackRef.current.length > 30) historyStackRef.current.shift();
      redoStackRef.current = [];
      lastSavedStateRef.current = nextStr;
      flashSaved();
      bumpHistory();
    }

    dataRef.current = next;
    setData(next);
    schedulePersist(next, false);
  }, [flashSaved, bumpHistory, schedulePersist]);

  // Quick save without creating an undo step (used while typing text).
  const quickSaveData = useCallback((updater: AppData | ((prev: AppData) => AppData)) => {
    if (!isHydratedRef.current) return;
    const base = cloneData(dataRef.current);
    const next = typeof updater === 'function' ? updater(base) : updater;

    dataRef.current = next;
    setData(next);
    schedulePersist(next, false);
  }, [schedulePersist]);

  // Turns anything saved with quickSaveData into ONE proper undo step (call on blur).
  const flushSave = useCallback(() => {
    saveData(prev => prev);
    flushPendingToStorage();
  }, [saveData, flushPendingToStorage]);

  const restoreState = useCallback((stateStr: string) => {
    const restored = normalizeData({ ...JSON.parse(stateStr), schoolLogo: dataRef.current.schoolLogo });
    dataRef.current = restored;
    setData(restored);
    schedulePersist(restored, false);
  }, [schedulePersist]);

  const undo = useCallback(() => {
    if (historyStackRef.current.length === 0) {
      toast("Nothing to undo", "info");
      return;
    }
    redoStackRef.current.push(lastSavedStateRef.current);
    const prevStateStr = historyStackRef.current.pop()!;
    lastSavedStateRef.current = prevStateStr;
    restoreState(prevStateStr);
    bumpHistory();
    toast("Undone", "info");
  }, [toast, restoreState, bumpHistory]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) {
      toast("Nothing to redo", "info");
      return;
    }
    historyStackRef.current.push(lastSavedStateRef.current);
    if (historyStackRef.current.length > 30) historyStackRef.current.shift();
    const nextStateStr = redoStackRef.current.pop()!;
    lastSavedStateRef.current = nextStateStr;
    restoreState(nextStateStr);
    bumpHistory();
    toast("Redone", "info");
  }, [toast, restoreState, bumpHistory]);

  // Import a backup: normalizes old formats, keeps it undoable, clears stale open records.
  const replaceAllData = useCallback((raw: unknown) => {
    const incoming = normalizeData(raw);
    // School name and logo belong to the school, not to a class: once set they stay the same
    // when another class is opened, restored, imported or started. (A fresh install with no
    // name/logo yet takes them from the file.)
    const cur = dataRef.current;
    const hasName = !!cur.schoolName && cur.schoolName !== "Your School Name";
    const next = {
      ...incoming,
      schoolName: hasName ? cur.schoolName : incoming.schoolName,
      schoolLogo: cur.schoolLogo || incoming.schoolLogo,
    };
    saveData(next);
    flushPendingToStorage();
    setActiveAssessmentId(null);
    setActiveFundId(null);
  }, [saveData, flushPendingToStorage, setActiveAssessmentId, setActiveFundId]);

  // Full reset: wipes data AND undo history (so it truly cannot be undone).
  const resetEverything = useCallback(async () => {
    [
      "classroomData",
      "classroomHideGS",
      "classroomTab",
      "classroomActiveAssessment",
      "classroomActiveFund",
      "classroomLastSaved",
      "classroomLastAutoBackup"
    ].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingSaveDataRef.current = null;

    const fresh = makeBaseData();
    const str = snapshotOf(fresh);
    historyStackRef.current = [];
    redoStackRef.current = [];
    lastSavedStateRef.current = str;
    dataRef.current = fresh;
    setData(fresh);

    try {
      const adapter = await getStorage();
      await adapter.clearAll();
      await adapter.saveAppData(fresh);
    } catch (e) {
      console.error('[ClassroomContext] Failed to reset storage:', e);
    }

    setActiveAssessmentIdState(null);
    setActiveFundIdState(null);
    bumpHistory();
    toast("All records reset to fresh defaults", "info");
  }, [bumpHistory, toast]);

  // Global Keyboard Shortcuts (Ctrl+Z / Ctrl+Y / Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHelpModalOpen(false);
        setInfoModal(prev => ({ ...prev, isOpen: false }));
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Dialogs
  const confirmResolveRef = useRef<((val: boolean) => void) | null>(null);
  const promptResolveRef = useRef<((val: string | null) => void) | null>(null);

  const closeConfirm = useCallback((val: boolean = false) => {
    const resolver = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmState({
      isOpen: false,
      message: '',
      opts: {},
      resolve: null
    });
    if (resolver) {
      resolver(val);
    }
  }, []);

  const closePrompt = useCallback((val: string | null = null) => {
    const resolver = promptResolveRef.current;
    promptResolveRef.current = null;
    setPromptState({
      isOpen: false,
      message: '',
      defaultValue: '',
      opts: {},
      resolve: null
    });
    if (resolver) {
      resolver(val);
    }
  }, []);

  const uiConfirm = useCallback((message: string, opts: ConfirmDialogOptions = {}): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      confirmResolveRef.current = resolve;
      setConfirmState({
        isOpen: true,
        message,
        opts,
        resolve: null
      });
    });
  }, []);

  const uiPrompt = useCallback((message: string, defaultValue: string = '', opts: PromptDialogOptions = {}): Promise<string | null> => {
    return new Promise<string | null>(resolve => {
      promptResolveRef.current = resolve;
      setPromptState({
        isOpen: true,
        message,
        defaultValue,
        opts,
        resolve: null
      });
    });
  }, []);

  const openHelp = useCallback(() => setHelpModalOpen(true), []);
  const closeHelp = useCallback(() => setHelpModalOpen(false), []);

  const showInfoModal = useCallback((title: string, content: React.ReactNode) => {
    setInfoModal({ isOpen: true, title, content });
  }, []);

  const closeInfoModal = useCallback(() => {
    setInfoModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Computation Methods
  const isTodayAttendanceTaken = useCallback((): boolean => {
    if (!data.students.length) return true;
    return !!data.attendance[todayKey()];
  }, [data.students.length, data.attendance]);

  const countDay = useCallback((k: string) => {
    const total = data.students.length;
    const day = data.attendance[k];
    if (!day) {
      return { total, present: total, absent: 0, leave: 0, holiday: false, taken: false, locked: false };
    }
    if (day.holiday) {
      return { total, present: 0, absent: 0, leave: 0, holiday: true, taken: true, locked: !!day.locked };
    }
    let absent = 0;
    let leave = 0;
    data.students.forEach(s => {
      const st = day.status[s.id] || "P";
      if (st === "A") absent++;
      else if (st === "L") leave++;
    });
    return {
      total,
      present: Math.max(0, total - absent - leave),
      absent,
      leave,
      holiday: false,
      taken: true,
      locked: !!day.locked
    };
  }, [data.students, data.attendance]);

  const studentMonthStats = useCallback((s: Student, monthKey: string) => {
    const parts = monthKey.split("-").map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    const today = todayKey();
    const joinKey = s.createdAt ? dateKey(new Date(s.createdAt)) : null;

    let p = 0;
    let a = 0;
    let l = 0;
    let h = 0;

    days.forEach(k => {
      if (k > today) return;
      const day = data.attendance[k];
      if (!day) return;
      if (day.holiday) {
        h++;
        return;
      }
      const explicitSt = day.status[s.id];
      if (explicitSt === undefined && joinKey && k < joinKey) return;
      if (explicitSt === "A") a++;
      else if (explicitSt === "L") l++;
      else p++;
    });

    const denom = p + a;
    const pct = denom ? Math.round((p / denom) * 100) : 0;
    return { p, a, l, h, pct };
  }, [data.attendance]);

  const classAttendanceForMonth = useCallback((mk: string) => {
    const parts = mk.split("-").map(Number);
    const days = getMonthDays(parts[0], parts[1] - 1);
    const today = todayKey();
    let p = 0;
    let a = 0;

    days.forEach(k => {
      if (k > today) return;
      const day = data.attendance[k];
      if (!day || day.holiday) return;
      data.students.forEach(s => {
        const jk = s.createdAt ? dateKey(new Date(s.createdAt)) : null;
        const explicitSt = day.status[s.id];
        if (explicitSt === undefined && jk && k < jk) return;
        const st = explicitSt || "P";
        if (st === "P") p++;
        else if (st === "A") a++;
      });
    });

    const denom = p + a;
    return { p, a, denom, pct: denom ? Math.round((p / denom) * 100) : 0 };
  }, [data.attendance, data.students]);

  const classAttendanceThisMonth = useCallback(() => {
    return classAttendanceForMonth(todayKey().slice(0, 7));
  }, [classAttendanceForMonth]);

  const calcAssessmentResult = useCallback((s: Student, asmt: Assessment) => {
    let total = 0;
    const passPct = Number(asmt.passPercent) || 40;
    const asmtRes = data.assessmentResults[asmt.id] || {};
    const studentRes = asmtRes[s.id] || {};

    const subMarks = asmt.subjects.map(sub => {
      const raw = studentRes[sub.id];
      let mark = 0;
      if (raw !== undefined && raw !== "A") {
        mark = Number(raw) || 0;
      }
      total += mark;
      const max = Number(sub.max) || 0;
      return {
        subId: sub.id,
        mark,
        max,
        // "below33" is a legacy name: a subject is flagged when it is under the assessment's pass mark (same rule as the prints)
        below33: max > 0 && (mark / max) * 100 < passPct
      };
    });

    const maxTotal = asmt.subjects.reduce((sum, sub) => sum + (Number(sub.max) || 0), 0);
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 1000) / 10 : 0;
    const computedPass = maxTotal > 0 && pct >= passPct;
    const manual = !!((data.assessmentManualPass[asmt.id] || {})[s.id]);
    const passed = computedPass || manual;

    return {
      total,
      maxTotal,
      pct,
      computedPass,
      passed,
      manual,
      subMarks,
      anyBelow33: subMarks.some(x => x.below33)
    };
  }, [data.assessmentResults, data.assessmentManualPass]);

  const computeAssessmentRanking = useCallback((asmtId: string) => {
    const asmt = data.assessments.find(a => a.id === asmtId);
    if (!asmt) return [];
    const students = getSortedStudents(data.students);
    const list = students.map(s => ({ s, r: calcAssessmentResult(s, asmt) }));
    const sorted = list.slice().sort((a, b) => b.r.total - a.r.total);

    let lastTotal: number | null = null;
    let lastRank = 0;
    const rankMap: Record<string, number> = {};
    sorted.forEach((item, i) => {
      if (item.r.total !== lastTotal) {
        lastRank = i + 1;
        lastTotal = item.r.total;
      }
      rankMap[item.s.id] = item.r.maxTotal > 0 ? lastRank : 0;
    });

    return list.map(item => ({
      ...item,
      rank: rankMap[item.s.id] || 0
    }));
  }, [data.assessments, data.students, calcAssessmentResult]);

  const assessmentEntryCount = useCallback((asmtId: string): number => {
    const res = data.assessmentResults[asmtId] || {};
    let count = 0;
    data.students.forEach(s => {
      const row = res[s.id];
      if (row && Object.keys(row).length > 0) count++;
    });
    return count;
  }, [data.assessmentResults, data.students]);

  const getFundStudentStatus = useCallback((fundId: string, sid: string) => {
    const fund = data.funds.find(f => f.id === fundId);
    if (!fund) return { code: 'PENDING' as const, amount: 0, target: 0, pct: 0, variable: true };
    const variable = (Number(fund.amount) || 0) <= 0;
    const payment = (data.fundPayments[fundId] || {})[sid] || {};

    if (payment.exempt) {
      return { code: 'EXEMPT' as const, amount: 0, target: fund.amount, pct: 0, exempt: true, variable };
    }

    const amount = Number(payment.amount) || 0;
    const target = Number(fund.amount) || 0;

    if (variable) {
      if (amount > 0) return { code: 'PAID' as const, amount, target: 0, pct: 100, variable: true };
      return { code: 'PENDING' as const, amount: 0, target: 0, pct: 0, variable: true };
    }

    if (amount >= target) {
      return { code: 'PAID' as const, amount, target, pct: 100, overpaid: amount > target, variable: false };
    }
    if (amount > 0) {
      return { code: 'PARTIAL' as const, amount, target, pct: Math.round((amount / target) * 100), variable: false };
    }
    return { code: 'PENDING' as const, amount: 0, target, pct: 0, variable: false };
  }, [data.funds, data.fundPayments]);

  const computeFundStats = useCallback((fundId: string) => {
    const fund = data.funds.find(f => f.id === fundId);
    const target = fund ? (Number(fund.amount) || 0) : 0;
    const variable = target <= 0;
    let collected = 0;
    let pending = 0;
    let paid = 0;
    let partial = 0;
    let pend = 0;
    let exempt = 0;
    let overpaidTotal = 0;

    const students = getSortedStudents(data.students);
    students.forEach(s => {
      const st = getFundStudentStatus(fundId, s.id);
      if (st.code === 'EXEMPT') {
        exempt++;
        return;
      }
      collected += st.amount;
      if (st.code === 'PAID') {
        paid++;
        if (st.overpaid) overpaidTotal += (st.amount - st.target);
      } else if (st.code === 'PARTIAL') {
        partial++;
        pending += Math.max(0, st.target - st.amount);
      } else {
        pend++;
        if (!variable) pending += st.target;
      }
    });

    const totalStudentsCounted = students.length - exempt;
    const totalTarget = variable ? 0 : totalStudentsCounted * target;
    const pct = variable
      ? (totalStudentsCounted > 0 ? Math.round((paid / totalStudentsCounted) * 100) : 0)
      : (totalTarget > 0 ? Math.round((collected / totalTarget) * 100) : 0);

    return {
      collected,
      pending,
      paid,
      partial,
      pend,
      exempt,
      overpaidTotal,
      totalStudentsCounted,
      totalTarget,
      pct,
      totalStudents: students.length,
      variable
    };
  }, [data.funds, data.students, getFundStudentStatus]);

  const classFundsSummary = useCallback(() => {
    let collected = 0;
    let target = 0;
    let paidCount = 0;
    let totalCounted = 0;

    data.funds.forEach(f => {
      const st = computeFundStats(f.id);
      collected += st.collected;
      target += st.totalTarget;
      paidCount += st.paid;
      totalCounted += st.totalStudentsCounted;
    });

    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return {
      collected,
      target,
      pct,
      paidCount,
      totalCounted,
      fundCount: data.funds.length
    };
  }, [data.funds, computeFundStats]);

  const classAverageForAssessment = useCallback((asmtId: string) => {
    const ranked = computeAssessmentRanking(asmtId);
    const asmtRes = data.assessmentResults[asmtId] || {};
    const entered = ranked.filter(x => {
      const r = asmtRes[x.s.id];
      return x.r.maxTotal > 0 && r && Object.keys(r).length > 0;
    });

    if (!entered.length) {
      return { avg: 0, passRate: 0, entered: 0, passed: 0, total: ranked.length };
    }

    const sumTotal = entered.reduce((sum, x) => sum + x.r.total, 0);
    const sumMax = entered.reduce((sum, x) => sum + x.r.maxTotal, 0);
    const avg = sumMax > 0 ? Math.round((sumTotal / sumMax) * 1000) / 10 : 0;
    const passed = entered.filter(x => x.r.passed).length;
    const passRate = entered.length ? Math.round((passed / entered.length) * 100) : 0;

    return { avg, passRate, entered: entered.length, passed, total: ranked.length };
  }, [computeAssessmentRanking, data.assessmentResults]);

  const buildPrintHeaderHTML = useCallback((title: string = "Student List", subline: string = "") => {
    const logoHTML = data.schoolLogo ? `<div class="print-logo-slot"><img src="${esc(data.schoolLogo)}" alt=""></div>` : "";
    const spacerHTML = data.schoolLogo ? `<div class="print-logo-slot print-logo-spacer"></div>` : "";
    const classSub = data.className ? `Class: ${esc(data.className)}` : "";
    const inchargeSub = data.inchargeName ? `Incharge: ${esc(data.inchargeName)}` : "";
    const line1 = [classSub, inchargeSub].filter(Boolean).join(" • ");
    const yearSub = data.academicYear ? esc(data.academicYear) : "";
    const noteLine = data.printNote ? esc(data.printNote) : "";

    return `<div class="print-header-inner">
      ${logoHTML}
      <div class="print-header-text">
        <h1>${esc(data.schoolName)}</h1>
        ${line1 ? `<div class="print-sub">${line1}</div>` : ''}
        ${yearSub ? `<div class="print-sub2">${yearSub}</div>` : ''}
        ${noteLine ? `<div class="print-sub2 cg-nocap" style="font-weight:700">${noteLine}</div>` : ''}
        <div class="sheet-title">${esc(title)}</div>
        ${subline ? `<div class="print-sub2" style="margin-top:1mm;font-weight:700">${subline}</div>` : ''}
      </div>
      ${spacerHTML}
    </div>`;
  }, [data.schoolLogo, data.className, data.inchargeName, data.academicYear, data.printNote, data.schoolName]);

  return (
    <ClassroomContext.Provider
      value={{
        data,
        activeTab,
        setActiveTab,
        activeAssessmentId,
        setActiveAssessmentId,
        activeFundId,
        setActiveFundId,
        darkMode,
        toggleDarkMode,
        tableSizeLevel,
        changeTableSize,
        saveData,
        quickSaveData,
        flushSave,
        replaceAllData,
        resetEverything,
        undo,
        redo,
        canUndo: historyStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
        toasts,
        toast,
        dismissToast,
        isSavedFlashing,
        uiConfirm,
        uiPrompt,
        closeConfirm,
        closePrompt,
        confirmState,
        promptState,
        helpModalOpen,
        openHelp,
        closeHelp,
        infoModal,
        showInfoModal,
        closeInfoModal,
        isTodayAttendanceTaken,
        countDay,
        studentMonthStats,
        classAttendanceForMonth,
        classAttendanceThisMonth,
        calcAssessmentResult,
        computeAssessmentRanking,
        assessmentEntryCount,
        computeFundStats,
        getFundStudentStatus,
        classFundsSummary,
        classAverageForAssessment,
        buildPrintHeaderHTML,
        isHydrated
      }}
    >
      {!isHydrated && loadError ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-stone-100 dark:bg-stone-950 text-stone-800 dark:text-stone-200 p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#991B1B] text-white flex items-center justify-center shadow-lg mb-4 text-2xl font-bold">CG</div>
          <div className="text-lg font-bold mb-1">Could not open your records</div>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-xs mb-4">
            Your data has not been deleted or changed. Tap Retry. If this keeps happening, restart the app.
          </p>
          <button
            type="button"
            onClick={() => setLoadAttempt(n => n + 1)}
            className="px-5 py-2.5 rounded-xl bg-[#991B1B] text-white text-sm font-bold cursor-pointer"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={startFreshAfterLoadError}
            className="mt-3 text-xs font-semibold text-stone-500 underline cursor-pointer"
          >
            Start with empty records
          </button>
        </div>
      ) : !isHydrated ? (
        <div className="min-h-screen flex flex-col items-center justify-center bg-stone-100 dark:bg-stone-950 text-stone-800 dark:text-stone-200 p-6 select-none">
          <div
            className="fixed top-0 left-0 right-0 z-50 bg-[#991B1B]"
            style={{ height: 'var(--safe-top, env(safe-area-inset-top, 0px))' }}
          />
          <div className="w-16 h-16 rounded-2xl bg-[#991B1B] text-white flex items-center justify-center shadow-lg mb-4 text-2xl font-bold tracking-tight">
            CG
          </div>
          <div className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-1 font-serif-academic">
            Classgrid
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2 mb-2">
            <svg className="animate-spin h-4 w-4 text-[#991B1B] dark:text-red-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Securing & loading records...</span>
          </div>
        </div>
      ) : (
        children
      )}
    </ClassroomContext.Provider>
  );
};

export const useClassroom = () => {
  const ctx = useContext(ClassroomContext);
  if (!ctx) throw new Error("useClassroom must be used within ClassroomProvider");
  return ctx;
};
