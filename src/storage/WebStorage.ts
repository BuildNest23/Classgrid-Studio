import { AppData } from '../types';
import { StorageAdapter, StorageEngineType } from './types';

const STORAGE_KEY = 'classroomData';
const LAST_SAVED_KEY = 'classroomLastSaved';

export class WebStorage implements StorageAdapter {
  private fallbackActive: boolean;

  constructor(fallbackActive = false) {
    this.fallbackActive = fallbackActive;
  }

  async init(): Promise<void> {
    // LocalStorage requires no async init, but verify access
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
    } catch (e) {
      console.warn('LocalStorage test write failed:', e);
    }
  }

  async loadAppData(): Promise<AppData | null> {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // Storage access blocked (e.g. privacy mode): nothing stored here to protect, keep the old behaviour
      console.error('Failed to read AppData from localStorage:', err);
      return null;
    }
    if (!raw) return null; // no record yet = genuinely fresh install
    try {
      return JSON.parse(raw) as AppData;
    } catch (err) {
      // An unreadable (corrupted) record must NOT be reported as "no data": the app would start
      // with empty defaults and overwrite the real record on the next save. Throwing shows the
      // "Could not open your records" retry screen instead (same behaviour as SqliteStorage).
      console.error('Failed to parse AppData from localStorage:', err);
      throw err;
    }
  }

  async saveAppData(data: AppData): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      const now = Date.now().toString();
      window.localStorage.setItem(STORAGE_KEY, serialized);
      window.localStorage.setItem(LAST_SAVED_KEY, now);
    } catch (err) {
      console.error('Failed to save AppData to localStorage:', err);
      throw err;
    }
  }

  async getLastSaved(): Promise<number | null> {
    try {
      const raw = window.localStorage.getItem(LAST_SAVED_KEY);
      if (!raw) return null;
      const num = parseInt(raw, 10);
      return Number.isNaN(num) ? null : num;
    } catch {
      return null;
    }
  }

  async clearAll(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LAST_SAVED_KEY);
    } catch (err) {
      console.error('Failed to clear AppData from localStorage:', err);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      console.error(`Failed to set localStorage key "${key}":`, err);
      throw err;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.error(`Failed to remove localStorage key "${key}":`, err);
    }
  }

  getStorageType(): StorageEngineType {
    return 'localStorage';
  }

  getStatus() {
    return {
      engine: 'localStorage' as StorageEngineType,
      isNative: false,
      details: this.fallbackActive
        ? 'Web Storage (Fallback Mode - SQLite Unavailable)'
        : 'Web Browser / LocalStorage',
      fallbackActive: this.fallbackActive,
    };
  }
}
