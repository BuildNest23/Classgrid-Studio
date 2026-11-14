import { triggerPrint } from './printEngine';

/** Options of the compact (one-line names, small boxes) version of a sheet, set in the print preview. */
export interface CompactOptions {
  orientation: 'portrait' | 'landscape';
  signatures: boolean;
  pct: boolean;
  caps: boolean;
}

export interface PrintRequest {
  html: string;
  /** The orientation this sheet is normally printed in. */
  orientation: 'portrait' | 'landscape';
  pageNumbers?: boolean;
  /** Builds the compact version of this sheet. When present, the preview offers a Compact sheet option. */
  compact?: (o: CompactOptions) => string;
}

type Listener = (req: PrintRequest) => void;
let listener: Listener | null = null;

export function registerPrintPreview(l: Listener | null) {
  listener = l;
}

/** Opens the print preview (with Auto-fit). Falls back to printing straight away if it is not mounted. */
export async function previewPrint(req: PrintRequest, fallback: { printSize: any; forceOrientation: string }): Promise<boolean> {
  if (listener) {
    listener(req);
    return true;
  }
  return triggerPrint(req.html, req.orientation, fallback.printSize, fallback.forceOrientation, !!req.pageNumbers);
}
