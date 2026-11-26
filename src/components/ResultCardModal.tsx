import React, { useCallback, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { StudentCardModal } from './StudentCardModal';
import { WatermarkOptions } from './WatermarkOptions';
import { ResultPrintCtx, buildReportCardsHTML } from '../utils/resultPrint';
import { useWatermark, watermarkActive } from '../utils/logoWatermark';
import { PRINT_SIZES } from '../utils/helpers';

interface Props {
  ctx: ResultPrintCtx;
  studentId: string;
  onChange: (studentId: string) => void;
  onClose: () => void;
}

/** Report card popup for one student (Results tab). */
export const ResultCardModal: React.FC<Props> = ({ ctx, studentId, onChange, onClose }) => {
  const wm = useWatermark();
  const [open, setOpen] = useState(false);
  const hasLogo = !!ctx.data.schoolLogo;
  const buildHTML = useCallback((id: string) => buildReportCardsHTML({ ...ctx, watermark: wm }, id), [ctx, wm]);
  const notice = useCallback(
    (id: string) => {
      const res = (ctx.data.assessmentResults[ctx.asmt.id] || {})[id] || {};
      const missing = ctx.asmt.subjects.filter(sub => res[sub.id] === undefined).map(sub => sub.name);
      return missing.length ? `Marks not entered yet: ${missing.join(', ')}` : '';
    },
    [ctx]
  );

  const options = (
    <div className="border-b border-stone-200 dark:border-stone-800">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-4 sm:px-5 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-stone-400" />
          <span className="truncate">
            Card options · Logo {watermarkActive(wm, ctx.data.schoolLogo) ? 'watermark' : 'in corner'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-3.5">
          <WatermarkOptions kind="result" hasLogo={hasLogo} />
        </div>
      )}
    </div>
  );

  return (
    <StudentCardModal
      items={ctx.ranked.map(i => ({ id: i.s.id, name: i.s.name, rollNo: i.s.rollNo }))}
      studentId={studentId}
      onChange={onChange}
      onClose={onClose}
      buildHTML={buildHTML}
      mult={(PRINT_SIZES[ctx.data.printSize] || PRINT_SIZES.m).mult}
      printSize={ctx.data.printSize}
      forceOrientation={ctx.data.forceOrientation}
      notice={notice}
      label="Report Card"
      options={options}
    />
  );
};
