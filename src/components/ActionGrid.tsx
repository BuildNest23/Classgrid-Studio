import React from 'react';

interface ActionGridProps {
  children: React.ReactNode;
  /** Responsive columns on md+ screens: defaults to 2, 3, or 4 */
  cols?: 2 | 3 | 4 | 5;
  className?: string;
}

/**
 * Reusable ActionGrid: enforces equal-width button grid across all screen sizes.
 * Mobile: grid-cols-2 gap-2.5
 * md+: md:grid-cols-N (where N is cols prop, default 2)
 */
export const ActionGrid: React.FC<ActionGridProps> = ({
  children,
  cols = 2,
  className = ''
}) => {
  const mdColsClass =
    cols === 5
      ? 'md:grid-cols-5'
      : cols === 4
      ? 'md:grid-cols-4'
      : cols === 3
      ? 'md:grid-cols-3'
      : 'md:grid-cols-2';

  return (
    <div className={`grid grid-cols-2 ${mdColsClass} gap-2.5 w-full ${className}`}>
      {children}
    </div>
  );
};

type ActionButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  icon?: React.ComponentType<{ className?: string }>;
  /** If true, spans all columns (col-span-2 md:col-span-full). If 'mobile-only', spans 2 cols on mobile and 1 col on md+. */
  fullWidth?: boolean | 'mobile-only';
  children: React.ReactNode;
  asLabel?: boolean;
}

const VARIANT_STYLES: Record<ActionButtonVariant, string> = {
  primary:
    'bg-[#991B1B] hover:bg-[#7F1D1D] active:bg-[#661010] text-white shadow-xs border border-transparent dark:bg-[#B91C1C] dark:hover:bg-[#991B1B]',
  secondary:
    'bg-stone-50 hover:bg-stone-100 active:bg-stone-200 text-stone-800 border border-stone-200 dark:bg-stone-800/90 dark:hover:bg-stone-700/90 dark:text-stone-200 dark:border-stone-700',
  success:
    'bg-[#D1FAE5] hover:bg-[#A7F3D0] active:bg-[#6EE7B7] text-[#065F46] border border-emerald-200 dark:bg-[#064E3B] dark:hover:bg-[#065F46] dark:text-[#A7F3D0] dark:border-emerald-800/80',
  danger:
    'bg-[#F8E4E1] hover:bg-[#FCA5A5] active:bg-[#F87171] text-[#7F1D1D] border border-rose-200 dark:bg-[#4A1A18] dark:hover:bg-[#5C201E] dark:text-[#F0C8C0] dark:border-rose-900/80'
};

/**
 * Reusable ActionButton:
 * Enforces `w-full min-h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap`.
 * Icon w-4 h-4 on the left, label centered. Identical height and width in any group.
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = 'secondary',
  icon: Icon,
  fullWidth = false,
  children,
  className = '',
  disabled,
  asLabel = false,
  type = 'button',
  ...rest
}) => {
  const colSpanClass =
    fullWidth === true
      ? 'col-span-2 md:col-span-full'
      : fullWidth === 'mobile-only'
      ? 'col-span-2 md:col-span-1'
      : '';
  const variantClass = VARIANT_STYLES[variant];

  const commonClass = `w-full min-h-12 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors select-none ${
    disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
  } ${variantClass} ${colSpanClass} ${className}`;

  if (asLabel) {
    return (
      <label className={commonClass}>
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        <span className="truncate">{children}</span>
      </label>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={commonClass}
      {...rest}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  );
};
