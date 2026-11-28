import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { NativePrint, ANDROID_DOWNLOAD_FOLDER } from '../plugins/nativePrint';

/**
 * Converts a standard Blob to base64 string (without data URL prefix).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file data'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64Index = dataUrl.indexOf(',');
      if (base64Index !== -1) {
        resolve(dataUrl.slice(base64Index + 1));
      } else {
        resolve(dataUrl);
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Sanitizes file names to remove filesystem-illegal characters and replace
 * spaces/brackets with clean hyphens for reliable Android FileProvider URIs.
 */
function sanitizeFileName(name: string, fallback = 'export-file'): string {
  const dotIndex = name.lastIndexOf('.');
  const ext = dotIndex !== -1 ? name.slice(dotIndex).toLowerCase() : '';
  const base = dotIndex !== -1 ? name.slice(0, dotIndex) : name;

  const cleanedBase = base
    .trim()
    .replace(/[\\/:*?"<>|()[\]{}+,=;@!#%&^]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const finalName = (cleanedBase.length > 0 ? cleanedBase.slice(0, 80) : fallback) + ext;
  return finalName;
}

interface ExportFileOptions {
  title?: string;
  dialogTitle?: string;
  preferShareOnWeb?: boolean;
}

/**
 * Unified cross-platform file export and share function.
 * Handles images (PNG/JPG), JSON backups, PDFs, and generic files.
 * 
 * - On Capacitor Android / iOS: writes the file to the app cache directory and triggers
 *   the native Android / iOS system share sheet (allowing the user to send via WhatsApp, Drive,
 *   Gmail, Bluetooth, or save to device storage).
 * - On web / desktop browsers: triggers standard browser download via object URL,
 *   or triggers navigator.share if requested and supported.
 *
 * @param blob - The file Blob (image, json, pdf, etc.)
 * @param filename - Desired filename (e.g. "classroom-backup-2026-10-12.json")
 * @param options - Optional title, dialogTitle, and web preferences
 * @returns boolean indicating whether the export or share action succeeded
 */
export async function exportFileBlob(
  blob: Blob,
  filename: string,
  options?: ExportFileOptions
): Promise<boolean> {
  const cleanFilename = sanitizeFileName(filename);
  const shareTitle = options?.title || cleanFilename.replace(/\.[^/.]+$/, '');
  const dialogTitle = options?.dialogTitle || `Save or Share ${shareTitle}`;

  // 1. Native Capacitor Runtime (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);

      // On Android, also save a permanent copy directly inside Download/ClassGrid
      let savedToDownloads = false;
      if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('NativePrint')) {
        try {
          await NativePrint.saveFileToDownloads({
            data: base64Data,
            fileName: cleanFilename,
            mimeType: blob.type || 'application/octet-stream',
            folder: ANDROID_DOWNLOAD_FOLDER,
          });
          savedToDownloads = true;
        } catch (dlErr) {
          console.warn('Could not save copy to Download/ClassGrid:', dlErr);
        }
      }

      // Write to Cache directory so the Android/iOS Share sheet can also send via WhatsApp/Drive/Gmail
      const savedFile = await Filesystem.writeFile({
        path: `exports/${cleanFilename}`,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      try {
        await Share.share({
          title: shareTitle,
          dialogTitle,
          files: [savedFile.uri],
        });
      } catch (shareErr: unknown) {
        // Dismissing the share sheet is clean; if already saved to Download/ClassGrid, still succeed
        const errorMsg = (shareErr as Error)?.message || String(shareErr);
        if (
          savedToDownloads ||
          errorMsg.includes('canceled') ||
          errorMsg.includes('cancelled') ||
          errorMsg.includes('dismissed') ||
          (shareErr as Error)?.name === 'AbortError'
        ) {
          return true;
        }
        throw shareErr;
      }

      return true;
    } catch (err: unknown) {
      // If user dismisses or cancels the share sheet, treat as clean completion
      const errorMsg = (err as Error)?.message || String(err);
      if (
        errorMsg.includes('canceled') ||
        errorMsg.includes('cancelled') ||
        errorMsg.includes('dismissed') ||
        (err as Error)?.name === 'AbortError'
      ) {
        return true;
      }
      console.warn('Native Capacitor share failed, falling back to browser download:', err);
      // Fall through to browser download as fallback
    }
  }

  // 2. Web / Browser Environment - optional Web Share API
  if (options?.preferShareOnWeb && typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      const file = new File([blob], cleanFilename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          files: [file],
        });
        return true;
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return true;
      console.warn('Web share failed, falling back to download:', err);
    }
  }

  // 3. Web Standard Anchor Download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (err) {
    console.error('Failed to trigger file download:', err);
    return false;
  }
}

/**
 * Convenience wrapper for images
 */
export async function exportImageBlob(
  blob: Blob,
  filename: string,
  title?: string
): Promise<boolean> {
  // Images always go to the share menu (Android share sheet, or the browser's share menu on a phone)
  return exportFileBlob(blob, filename, {
    title,
    dialogTitle: title ? `Share ${title}` : undefined,
    preferShareOnWeb: true,
  });
}
