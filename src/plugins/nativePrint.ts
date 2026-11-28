import { registerPlugin } from '@capacitor/core';

export interface NativePrintOptions {
  html: string;
  name?: string;
  orientation?: 'portrait' | 'landscape';
  paperSize?: 'A4' | 'LETTER' | 'LEGAL' | 'A5';
  colorMode?: 'color' | 'monochrome';
}

export interface NativePrintPlugin {
  printHtml(options: NativePrintOptions): Promise<void>;
}

export const NativePrint = registerPlugin<NativePrintPlugin>('NativePrint');
