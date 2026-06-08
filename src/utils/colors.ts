import { getTopLevelCode } from '../data/msc2020';

/** Distinct, calm palette keyed by top-level MSC field */
const FIELD_COLORS: Record<string, string> = {
  '00': '#6b7280',
  '01': '#78716c',
  '03': '#6366f1',
  '05': '#8b5cf6',
  '06': '#a855f7',
  '08': '#9333ea',
  '11': '#2563eb',
  '12': '#3b82f6',
  '13': '#0ea5e9',
  '14': '#0891b2',
  '15': '#06b6d4',
  '16': '#14b8a6',
  '17': '#10b981',
  '18': '#059669',
  '19': '#16a34a',
  '20': '#65a30d',
  '22': '#84cc16',
  '26': '#ca8a04',
  '28': '#d97706',
  '30': '#ea580c',
  '32': '#f97316',
  '33': '#ef4444',
  '34': '#dc2626',
  '35': '#e11d48',
  '37': '#db2777',
  '39': '#c026d3',
  '40': '#a21caf',
  '41': '#7c3aed',
  '42': '#4f46e5',
  '43': '#4338ca',
  '44': '#3730a3',
  '45': '#1d4ed8',
  '46': '#0369a1',
  '47': '#0e7490',
  '49': '#0f766e',
  '51': '#15803d',
  '52': '#4d7c0f',
  '53': '#a16207',
  '54': '#b45309',
  '55': '#c2410c',
  '57': '#be123c',
  '58': '#9d174d',
  '60': '#7e22ce',
  '62': '#6d28d9',
  '65': '#5b21b6',
  '68': '#4338ca',
  '70': '#334155',
  '74': '#475569',
  '76': '#64748b',
  '78': '#71717a',
  '80': '#52525b',
  '81': '#7c3aed',
  '82': '#6b21a8',
  '83': '#581c87',
  '85': '#1e293b',
  '86': '#374151',
  '90': '#115e59',
  '91': '#166534',
  '92': '#365314',
  '93': '#713f12',
  '94': '#9a3412',
  '97': '#831843',
};

const DEFAULT_COLOR = '#64748b';
const FOLDER_COLOR = '#94a3b8';

export function colorForMscCodes(mscCodes: string[], override?: string): string {
  if (override) return override;
  if (mscCodes.length === 0) return DEFAULT_COLOR;
  const top = getTopLevelCode(mscCodes[0]);
  return FIELD_COLORS[top] ?? DEFAULT_COLOR;
}

export function colorForNode(
  type: 'concept' | 'field-folder',
  mscCodes: string[],
  override?: string,
): string {
  if (override) return override;
  if (type === 'field-folder') {
    return mscCodes.length > 0 ? colorForMscCodes(mscCodes) : FOLDER_COLOR;
  }
  return colorForMscCodes(mscCodes);
}

export function lighten(hex: string, amount = 0.15): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
