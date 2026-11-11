import React, { useEffect, useRef, useState } from 'react';
import { PlainTextInput } from './PlainTextInput';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  /** Current value from the app data (source of truth). */
  value: string | number;
  /** Called when the field loses focus (commit). */
  onCommit: (text: string) => void;
  /** Optional: called on every keystroke (e.g. for quick, history-free saving). */
  onLive?: (text: string) => void;
};

/**
 * A text input that behaves like a normal controlled input while you type,
 * but ALWAYS re-syncs to the real data when you are not editing it.
 * Fixes stale values after Undo/Redo, the "A" toggle, Exempt, Mark All Paid, Import, etc.
 */
export const SyncInput: React.FC<Props> = ({ value, onCommit, onLive, onFocus, onBlur, ...rest }) => {
  const str = String(value ?? "");
  const [text, setText] = useState(str);
  const [tick, setTick] = useState(0);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(str);
  }, [str, tick]);

  const textLike = !rest.type || rest.type === 'text' || rest.type === 'tel' || rest.type === 'search';
  const Field: any = textLike ? PlainTextInput : 'input';

  return (
    <Field
      {...rest}
      value={text}
      onFocus={e => {
        focused.current = true;
        onFocus?.(e);
      }}
      onChange={e => {
        setText(e.target.value);
        onLive?.(e.target.value);
      }}
      onBlur={e => {
        focused.current = false;
        onCommit(e.target.value);
        setTick(t => t + 1); // force re-sync even if the committed value was rejected
        onBlur?.(e);
      }}
    />
  );
};
