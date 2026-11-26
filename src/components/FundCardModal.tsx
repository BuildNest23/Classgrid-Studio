import React, { useCallback, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { StudentCardModal } from './StudentCardModal';
import { WatermarkOptions } from './WatermarkOptions';
import { useWatermark, watermarkActive } from '../utils/logoWatermark';
import { ResultPrintStyle } from '../utils/resultPrint';
import {
  buildFeeReceiptHTML,
  loadReceiptStyle,
  saveReceiptStyle,
  loadReceiptThanks,
  saveReceiptThanks,
  receiptBalance,
  receiptNumber
} from '../utils/feeReceipt';
import { AppData } from '../types';
import { PRINT_SIZES, fmtMoney } from '../utils/helpers';
import { PlainTextInput } from './PlainTextInput';

interface Props {
  data: AppData;
  students: { id: string; name: string; rollNo: string }[];
  studentId: string;
  onChange: (studentId: string) => void;
  onClose: () => void;
}

/** Fee receipt popup for one student (Funds tab): design A (colour) or B (black and white),
 *  all funds or only one fund, with an editable thank-you line. */
export const FundCardModal: React.FC<Props> = ({ data, students, studentId, onChange, onClose }) => {
  const [style, setStyle] = useState<ResultPrintStyle>(loadReceiptStyle);
  const [thanks, setThanks] = useState<string>(loadReceiptThanks);
  const [scope, setScope] = useState<string>('all'); // 'all' or a fund id
  const [open, setOpen] = useState(false);
  const wm = useWatermark();

  const fund = scope !== 'all' ? data.funds.find(f => f.id === scope) : undefined;
  const fundId = fund ? fund.id : null; // a deleted fund falls back to "all funds"

  const pickStyle = (st: ResultPrintStyle) => {
    setStyle(st);
    saveReceiptStyle(st);
  };
  const changeThanks = (text: string) => {
    setThanks(text);
    saveReceiptThanks(text);
  };

  const buildHTML = useCallback(
    (id: string) => buildFeeReceiptHTML({ style, data, thanks, fundId, watermark: wm }, id),
    [style, data, thanks, fundId, wm]
  );
  const notice = useCallback(
    (id: string) => {
      const owing = receiptBalance(data, id, fundId);
      return owing > 0 ? `Balance due: ${fmtMoney(owing)}` : '';
    },
    [data, fundId]
  );

  const seg = (active: boolean) =>
    `flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
      active
        ? 'bg-red-800 border-red-800 dark:bg-red-700 dark:border-red-700 text-white'
        : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700'
    }`;
  const field =
    'w-full min-h-[40px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm px-3 py-2 outline-none focus:border-red-700 dark:focus:border-red-500';
  const lbl = 'block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1';

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
            Receipt options · {style === 'a' ? 'Colour' : 'Black & white'} · {fund ? fund.name : 'All funds'}
            {watermarkActive(wm, data.schoolLogo) ? ' · Watermark' : ''}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-3.5 space-y-3">
          <div>
            <span className={lbl}>Design</span>
            <div className="flex gap-2">
              <button type="button" className={seg(style === 'a')} onClick={() => pickStyle('a')}>
                A · Colour
              </button>
              <button type="button" className={seg(style === 'b')} onClick={() => pickStyle('b')}>
                B · Black &amp; white
              </button>
            </div>
          </div>
          <div>
            <label className={lbl} htmlFor="receipt-scope">
              Include
            </label>
            <select id="receipt-scope" className={field} value={fund ? fund.id : 'all'} onChange={e => setScope(e.target.value)}>
              <option value="all">All funds</option>
              {data.funds.map(f => (
                <option key={f.id} value={f.id}>
                  Only this fund: {f.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Receipt number: <span className="font-semibold text-stone-800 dark:text-stone-200 font-mono-num">{receiptNumber(data, studentId, fundId)}</span>
            </p>
          </div>
          <div>
            <label className={lbl} htmlFor="receipt-thanks">
              Thank-you line (leave blank to hide)
            </label>
            <PlainTextInput
              id="receipt-thanks"
              className={field}
              value={thanks}
              maxLength={90}
              onChange={e => changeThanks(e.target.value)}
            />
          </div>
          <WatermarkOptions kind="receipt" hasLogo={!!data.schoolLogo} />
        </div>
      )}
    </div>
  );

  return (
    <StudentCardModal
      items={students}
      studentId={studentId}
      onChange={onChange}
      onClose={onClose}
      buildHTML={buildHTML}
      mult={(PRINT_SIZES[data.printSize] || PRINT_SIZES.m).mult}
      printSize={data.printSize}
      forceOrientation={data.forceOrientation}
      notice={notice}
      label={fund ? `Fee Receipt - ${fund.name}` : 'Fee Receipt'}
      receipt
      options={options}
    />
  );
};
