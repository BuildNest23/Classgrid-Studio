import { AppData } from '../types';
import {
  importIntoShelf,
  isBlankClass,
  listShelf,
  loadFromShelf,
  resolveRestoredActiveId,
  restoreClasses,
  setActiveShelfId,
} from './classShelf';
import { normalizeData } from './migrate';
import { savePrefs } from './prefs';

export async function performRestore(
  file: File,
  replaceAllData: (d: any) => void,
  uiConfirm: (msg: string, opts?: any) => Promise<boolean>,
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  currentData?: AppData
): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);

        if (parsed && parsed.app === 'ClassgridAI') {
          throw new Error('This is an Edit with AI file, not a backup. Import it in the Students tab instead.');
        }

        // Handle "back up all classes" (ClassGridShelf) files cleanly as well
        if (parsed && parsed.app === 'ClassGridShelf' && Array.isArray(parsed.classes)) {
          const count = parsed.classes.filter((c: any) => c && c.data).length;
          if (count === 0) throw new Error('This backup file contains no classes.');
          const ok = await uiConfirm(
            `Import ${count} saved class${count === 1 ? '' : 'es'} into the Classes tab?\n\nMatching existing classes will be updated instead of duplicated.`,
            {
              title: 'Import saved classes',
              yesText: 'Import',
              danger: false,
              icon: 'warning',
            }
          );
          if (!ok) {
            resolve(false);
            return;
          }
          const { added, updated } = await importIntoShelf(parsed, currentData);
          if (currentData && isBlankClass(currentData)) {
            const shelf = await listShelf();
            if (shelf.length > 0) {
              const first = await loadFromShelf(shelf[0].id);
              if (first) {
                setActiveShelfId(shelf[0].id);
                replaceAllData({ ...first, schoolLogo: currentData.schoolLogo || first.schoolLogo });
              }
            }
          }
          savePrefs({ welcomeDone: true });
          const parts: string[] = [];
          if (updated) parts.push(`Updated ${updated} existing class${updated === 1 ? '' : 'es'}`);
          if (added) parts.push(`Added ${added} new class${added === 1 ? '' : 'es'}`);
          toast(parts.length ? `${parts.join(' · ')}.` : 'Backup imported successfully.', 'success');
          resolve(true);
          return;
        }

        let importedData = null;
        if (parsed && parsed.app === 'ClassroomManager' && parsed.data) {
          importedData = parsed.data;
        } else if (parsed && parsed.students && Array.isArray(parsed.students)) {
          importedData = parsed;
        } else {
          throw new Error('Invalid backup format');
        }

        const savedClasses: unknown = Array.isArray(parsed.classes) ? parsed.classes : [];
        const classCount = (savedClasses as unknown[]).length;
        const ok = await uiConfirm(
          `Replace current data with imported backup?\n\nThis will overwrite the open class.${classCount ? `\nIt also restores ${classCount} saved class${classCount === 1 ? '' : 'es'} in the Classes tab.` : ''}`,
          {
            title: 'Restore from file',
            yesText: 'Restore',
            danger: true,
            icon: 'warning',
          }
        );
        if (!ok) {
          resolve(false);
          return;
        }

        const normalizedOpen = normalizeData(importedData);
        const explicitClassId =
          typeof parsed.classId === 'string' && parsed.classId.trim() ? parsed.classId.trim() : null;

        let restored = 0;
        if (classCount) {
          try {
            restored = await restoreClasses(savedClasses);
          } catch {
            toast('The open class was imported, but saved classes could not be restored.', 'error');
          }
        }

        let activeId: string | null = null;
        try {
          activeId = await resolveRestoredActiveId(normalizedOpen, explicitClassId);
        } catch {
          activeId = null;
        }

        setActiveShelfId(activeId);
        replaceAllData(importedData);

        savePrefs({ welcomeDone: true });
        toast(
          restored
            ? `Backup imported. ${restored} saved class${restored === 1 ? '' : 'es'} restored.`
            : 'Backup imported successfully.',
          'success'
        );
        resolve(true);
      } catch (err: any) {
        toast('Could not import: ' + (err?.message || 'Invalid file'), 'error');
        resolve(false);
      }
    };
    reader.onerror = () => {
      toast('Error reading file', 'error');
      resolve(false);
    };
    reader.readAsText(file);
  });
}

