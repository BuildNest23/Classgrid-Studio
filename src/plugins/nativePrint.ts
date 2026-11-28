import { registerPlugin } from '@capacitor/core';

export const ANDROID_DOWNLOAD_FOLDER = 'ClassGrid';

export interface NativePrintOptions {
  html: string;
  name?: string;
  orientation?: 'portrait' | 'landscape';
  paperSize?: 'A4' | 'LETTER' | 'LEGAL' | 'A5';
  colorMode?: 'color' | 'monochrome';
}

export interface SavePdfOptions extends NativePrintOptions {
  folder?: string;
}

export interface SaveFileOptions {
  data: string;
  fileName: string;
  mimeType?: string;
  folder?: string;
}

export interface SavedDownloadResult {
  fileName: string;
  path: string;
  uri: string;
}

export interface NativePrintPlugin {
  printHtml(options: NativePrintOptions): Promise<void>;
  savePdfToDownloads(options: SavePdfOptions): Promise<SavedDownloadResult>;
  saveFileToDownloads(options: SaveFileOptions): Promise<SavedDownloadResult>;
}

export const NativePrint = registerPlugin<NativePrintPlugin>('NativePrint');
