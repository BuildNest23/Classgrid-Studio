import React, { useState, useEffect, useRef } from 'react';
import { useClassroom } from '../context/ClassroomContext';
import { AlertTriangle, CheckCircle, HelpCircle, Info, Edit3 } from 'lucide-react';
import { PlainTextInput } from './PlainTextInput';

export const ConfirmModal: React.FC = () => {
  const { confirmState, closeConfirm } = useClassroom();

  useEffect(() => {
    if (!confirmState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState.isOpen, closeConfirm]);

  if (!confirmState.isOpen) return null;

  const { message, opts } = confirmState;

  const handleYes = () => {
    closeConfirm(true);
  };

  const handleNo = () => {
    closeConfirm(false);
  };

  const renderIcon = () => {
    if (opts.danger || opts.icon === 'warning') {
      return <AlertTriangle className="w-8 h-8 text-rose-600" />;
    }
    if (opts.icon === 'success') {
      return <CheckCircle className="w-8 h-8 text-emerald-600" />;
    }
    if (opts.icon === 'question') {
      return <HelpCircle className="w-8 h-8 text-amber-600" />;
    }
    return <Info className="w-8 h-8 text-sky-600" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) handleNo();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-2xl">
            {renderIcon()}
          </div>
        </div>
        <h3 className="text-lg font-bold text-center text-stone-900 dark:text-stone-100 mb-2">
          {opts.title || "Confirm Action"}
        </h3>
        <p className="text-sm text-stone-600 dark:text-stone-400 text-center leading-relaxed mb-5 whitespace-pre-line">
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleNo}
            className="flex-1 min-h-[44px] py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-sm rounded-xl transition cursor-pointer"
          >
            {opts.noText || "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleYes}
            className={`flex-1 min-h-[44px] py-2.5 px-4 font-bold text-sm text-white rounded-xl shadow-xs transition cursor-pointer ${
              opts.danger
                ? 'bg-rose-700 hover:bg-rose-800'
                : 'bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600'
            }`}
          >
            {opts.yesText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const PromptModal: React.FC = () => {
  const { promptState, closePrompt } = useClassroom();
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (promptState.isOpen) {
      setVal(promptState.defaultValue || "");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [promptState.isOpen, promptState.defaultValue]);

  if (!promptState.isOpen) return null;

  const { message, opts } = promptState;

  const handleOk = () => {
    closePrompt(val);
  };

  const handleCancel = () => {
    closePrompt(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,calc(var(--safe-top,env(safe-area-inset-top,0px))+0.75rem))] pb-[max(1rem,calc(var(--safe-bottom,env(safe-area-inset-bottom,0px))+0.75rem))] bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="p-3 bg-red-50 dark:bg-red-950/60 rounded-2xl text-red-700 dark:text-red-400">
            <Edit3 className="w-8 h-8" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-center text-stone-900 dark:text-stone-100 mb-2">
          {opts.title || "Input Value"}
        </h3>
        <p className="text-sm text-stone-600 dark:text-stone-400 text-center leading-relaxed mb-4">
          {message}
        </p>
        <div className="mb-5">
          <PlainTextInput
            ref={inputRef}
                        value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleOk();
              if (e.key === 'Escape') handleCancel();
            }}
            className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-300 dark:border-stone-700 rounded-xl text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-red-600"
            placeholder="Type value here..."
          />
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 min-h-[44px] py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-sm rounded-xl transition cursor-pointer"
          >
            {opts.noText || "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="flex-1 min-h-[44px] py-2.5 px-4 font-bold text-sm text-white bg-red-800 hover:bg-red-900 dark:bg-red-700 dark:hover:bg-red-600 rounded-xl shadow-xs transition cursor-pointer"
          >
            {opts.yesText || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};
