// Which optional columns appear in the printed / saved Student List.
// Remembered on this device.
export type OptionalCol = 'phone' | 'address' | 'occupation' | 'notes';
export type ListColumns = Record<OptionalCol, boolean>;

const KEY = 'classgridStudentListCols';
export const DEFAULT_LIST_COLUMNS: ListColumns = { phone: true, address: true, occupation: true, notes: true };

export const OPTIONAL_COLS: { key: OptionalCol; label: string }[] = [
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'notes', label: 'Notes' },
];

export function loadListColumns(): ListColumns {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        phone: p.phone !== false,
        address: p.address !== false,
        occupation: p.occupation !== false,
        notes: p.notes !== false,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_LIST_COLUMNS };
}

export function saveListColumns(c: ListColumns) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
