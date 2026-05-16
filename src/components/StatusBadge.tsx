// src/components/StatusBadge.tsx

import type { DoubleStatus, SelectionStatus } from '@/lib/types';

type Status = DoubleStatus | SelectionStatus;

interface Props {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
}

const CONFIG: Record<Status, { label: string; bg: string; text: string; dot: string }> = {
  WIN: {
    label: 'WIN',
    bg: 'bg-green-500/15 border border-green-500/30',
    text: 'text-green-400',
    dot: 'bg-green-400 pulse-win',
  },
  LOSS: {
    label: 'LOSS',
    bg: 'bg-red-500/15 border border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-400',
  },
  PENDING: {
    label: 'PENDING',
    bg: 'bg-yellow-500/10 border border-yellow-500/20',
    text: 'text-yellow-400',
    dot: 'bg-yellow-400 pulse-pending',
  },
  VOID: {
    label: 'VOID',
    bg: 'bg-gray-500/10 border border-gray-500/20',
    text: 'text-gray-400',
    dot: 'bg-gray-400',
  },
};

export function StatusBadge({ status, size = 'md' }: Props) {
  const cfg = CONFIG[status];

  const sizeClass = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono-data font-bold tracking-wider ${cfg.bg} ${cfg.text} ${sizeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
