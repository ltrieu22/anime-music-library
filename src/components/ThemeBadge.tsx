import React from 'react';

type ThemeBadgeSize = 'table' | 'compact' | 'inherit';

interface ThemeBadgeProps {
  themeType?: string;
  size?: ThemeBadgeSize;
  className?: string;
}

const THEME_COLOR_CLASSES = {
  insert: 'bg-purple-950/80 border-purple-800/70 text-purple-300',
  ending: 'bg-sky-950/80 border-sky-800/70 text-sky-300',
  opening: 'bg-emerald-950/80 border-emerald-800/70 text-emerald-300',
} as const;

const THEME_SIZE_CLASSES: Record<ThemeBadgeSize, string> = {
  table: 'text-sm',
  compact: 'text-[10px]',
  inherit: '',
};

function getThemeKind(themeType: string): keyof typeof THEME_COLOR_CLASSES {
  const normalizedType = themeType.toUpperCase();

  if (normalizedType.includes('INSERT') || normalizedType === 'IN') return 'insert';
  if (normalizedType.startsWith('ED') || normalizedType.includes('ENDING')) return 'ending';
  return 'opening';
}

export const ThemeBadge: React.FC<ThemeBadgeProps> = ({
  themeType,
  size = 'table',
  className = '',
}) => {
  if (!themeType) return null;

  const colorClasses = THEME_COLOR_CLASSES[getThemeKind(themeType)];

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded border px-1.5 py-0.5 font-mono font-semibold ${THEME_SIZE_CLASSES[size]} ${colorClasses} ${className}`}
    >
      {themeType}
    </span>
  );
};
