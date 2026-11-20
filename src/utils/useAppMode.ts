import { useEffect, useState, useCallback } from 'react';
import { AppMode, getMode, setMode as storeMode } from './appMode';

const EVT = 'classgrid-mode-changed';

export function useAppMode(): [AppMode | null, (m: AppMode) => void] {
  const [mode, setState] = useState<AppMode | null>(() => getMode());
  useEffect(() => {
    const on = () => setState(getMode());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const set = useCallback((m: AppMode) => {
    storeMode(m);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [mode, set];
}
