import { PRINT_SIZES } from './helpers';

/** Shows the print settings from Class settings before a result card prints. true = print, false = go change the settings. */
export async function confirmCardPrintSettings(
  uiConfirm: (message: string, opts?: { title?: string; icon?: string; yesText?: string; noText?: string; danger?: boolean }) => Promise<boolean>,
  printSize: string,
  forceOrientation: string
): Promise<boolean> {
  const orient =
    forceOrientation === 'landscape' ? 'Landscape (forced in Class settings)'
    : forceOrientation === 'portrait' ? 'Portrait (forced in Class settings)'
    : 'Portrait (automatic)';
  const size = (PRINT_SIZES as Record<string, { label: string }>)[printSize]?.label || 'Medium (default)';
  const warn = forceOrientation === 'landscape'
    ? '\n\nLandscape is forced, so the card will print sideways and split over two pages. Result cards are made for Portrait.'
    : '';
  return uiConfirm(
    `Orientation: ${orient}\nText size: ${size}${warn}\n\nPrint with these settings?`,
    { title: 'Print settings', icon: forceOrientation === 'landscape' ? 'warning' : 'info', yesText: 'Print', noText: 'Change settings' }
  );
}
