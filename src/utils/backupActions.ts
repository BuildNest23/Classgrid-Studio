import { AppData } from '../types';
import { exportFileBlob } from './nativeFileExport';
import { exportAllClasses, restoreClasses, setActiveShelfId, getActiveShelfId } from './classShelf';
import { Capacitor } from '@capacitor/core';
import { savePrefs } from './prefs';

export async function performBackup(
  data: AppData,
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
): Promise<boolean> {
  try {
    const classes = await exportAllClasses(data);
    const payload = {
      app: "ClassroomManager",
      version: 6,
      exportedAt: new Date().toISOString(),
      ...(getActiveShelfId() ? { classId: getActiveShelfId() } : {}),
      data: data,
      ...(classes.length > 0 ? { classes } : {})
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `classroom-backup-${stamp}.json`;
    const title = `ClassGrid Backup (${stamp})`;

    const exported = await exportFileBlob(blob, filename, {
      title,
      dialogTitle: "Save or Share Backup File",
      preferShareOnWeb: false
    });
    if (!exported) {
      toast("Could not export the backup file.", "error");
      return false;
    }

    try { localStorage.setItem('classgrid_last_backup', String(Date.now())); } catch { /* ignore */ }
    if (Capacitor.isNativePlatform()) {
      toast("Backup ready in Android share sheet.", "success");
    } else {
      toast("Backup file downloaded.", "success");
    }
    return true;
  } catch (err: any) {
    toast("Backup failed: " + (err?.message || "Unknown error"), "error");
    return false;
  }
}

export async function performRestore(
  file: File,
  replaceAllData: (d: any) => void,
  uiConfirm: (msg: string, opts?: any) => Promise<boolean>,
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);

        let importedData = null;
        if (parsed.app === "ClassroomManager" && parsed.data) {
          importedData = parsed.data;
        } else if (parsed.students && Array.isArray(parsed.students)) {
          importedData = parsed;
        } else {
          throw new Error("Invalid backup format");
        }

        const savedClasses: unknown = Array.isArray(parsed.classes) ? parsed.classes : [];
        const classCount = (savedClasses as unknown[]).length;
        const ok = await uiConfirm(
          `Replace current data with imported backup?\n\nThis will overwrite the open class.${classCount ? `\nIt also restores ${classCount} saved class${classCount === 1 ? '' : 'es'} in the Classes tab.` : ''}`,
          {
            title: "Restore from file",
            yesText: "Restore",
            danger: true,
            icon: "warning"
          }
        );
        if (!ok) {
          resolve(false);
          return;
        }

        replaceAllData(importedData);
        setActiveShelfId(null);
        let restored = 0;
        if (classCount) {
          try {
            restored = await restoreClasses(savedClasses);
          } catch {
            toast("The open class was imported, but saved classes could not be restored.", "error");
          }
        }

        savePrefs({ welcomeDone: true });
        toast(restored ? `Backup imported. ${restored} saved class${restored === 1 ? '' : 'es'} restored.` : "Backup imported successfully.", "success");
        resolve(true);
      } catch (err: any) {
        toast("Could not import: " + (err?.message || "Invalid file"), "error");
        resolve(false);
      }
    };
    reader.onerror = () => {
      toast("Error reading file", "error");
      resolve(false);
    };
    reader.readAsText(file);
  });
}
