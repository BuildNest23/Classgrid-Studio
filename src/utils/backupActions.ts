import { restoreClasses, setActiveShelfId } from './classShelf';
import { savePrefs } from './prefs';

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
