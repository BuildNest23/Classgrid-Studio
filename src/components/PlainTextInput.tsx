import React from 'react';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'wrap'> & {
  /** Kept so existing fields can be swapped in unchanged: "tel" → phone keypad, "search" → no extra behaviour. */
  type?: string;
};

/**
 * A one-line text box built on <textarea>.
 *
 * Why: on Android, Chrome / Google Autofill adds a toolbar above the keyboard (passwords, cards,
 * addresses) for ordinary <input> text fields, which keeps getting in the way. It does not do that
 * for a <textarea>. This looks and behaves like a normal single-line input:
 *  - Enter never adds a new line: it submits the form (or runs the field's own onKeyDown first)
 *  - pasted line breaks become spaces
 *  - long text scrolls sideways instead of wrapping
 */
export const PlainTextInput = React.forwardRef<HTMLTextAreaElement, Props>(
  ({ type, inputMode, onKeyDown, onChange, className = '', ...rest }, ref) => {
    const mode = inputMode ?? (type === 'tel' ? 'tel' : undefined);
    return (
      <textarea
        {...rest}
        ref={ref}
        rows={1}
        wrap="off"
        inputMode={mode}
        autoComplete="off"
        autoCorrect="off"
        data-form-type="other"
        data-lpignore="true"
        className={`${className} block resize-none overflow-x-auto overflow-y-hidden whitespace-nowrap`}
        onKeyDown={e => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        onChange={e => {
          if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
          onChange?.(e);
        }}
      />
    );
  }
);
PlainTextInput.displayName = 'PlainTextInput';
