import React from 'react';
import {
  WatermarkKind,
  WATERMARK_LIMITS,
  updateWatermark,
  useWatermark
} from '../utils/logoWatermark';

interface Props {
  /** Which paper these sliders belong to: a result card or a fee receipt */
  kind: WatermarkKind;
  /** Whether a school logo has been uploaded (the watermark needs one) */
  hasLogo: boolean;
  /** Extra classes for the outer box */
  className?: string;
}

/**
 * "Logo as watermark" switch with Size and Transparency sliders.
 * The switch is universal (the same on every screen). The sliders appear only while it is on.
 * Switching it off puts the logo back in the top-left corner of the paper.
 */
export const WatermarkOptions: React.FC<Props> = ({ kind, hasLogo, className = '' }) => {
  const wm = useWatermark();
  const look = wm[kind];
  const on = wm.enabled && hasLogo;
  const lim = WATERMARK_LIMITS;

  const setLook = (patch: { size?: number; opacity?: number }) =>
    updateWatermark(kind === 'result' ? { result: patch } : { receipt: patch });

  const slider = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (n: number) => void
  ) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-xs font-medium text-stone-600 dark:text-stone-400">
          {label}
        </label>
        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 font-mono-num">{value}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-red-800 dark:accent-red-500 cursor-pointer"
      />
    </div>
  );

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        on
          ? 'border-red-800/30 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/50'
          : 'border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/30'
      } ${className}`}
    >
      <label className={`flex items-start gap-2.5 select-none ${hasLogo ? 'cursor-pointer' : 'cursor-not-allowed opacity-65'}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={!hasLogo}
          onChange={e => updateWatermark({ enabled: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-red-800 dark:accent-red-500 shrink-0 rounded"
        />
        <span className="flex flex-col leading-snug">
          <span className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">Logo as watermark</span>
          <span className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {hasLogo
              ? 'Place a subtle grey logo behind the page instead of the top-left corner'
              : 'Upload a school logo in Settings to enable watermark'}
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 pt-3 border-t border-red-900/10 dark:border-red-900/30 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {slider(`wm-size-${kind}`, 'Size', look.size, lim.size.min, lim.size.max, lim.size.step, n =>
            setLook({ size: n })
          )}
          {slider(
            `wm-opacity-${kind}`,
            'Visibility',
            look.opacity,
            lim.opacity.min,
            lim.opacity.max,
            lim.opacity.step,
            n => setLook({ opacity: n })
          )}
        </div>
      )}
    </div>
  );
};
