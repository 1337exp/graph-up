import type { DataType, PinDef } from '@/graph/types';

const DATA_COLORS: Record<DataType, string> = {
    number: '#4fc3f7',
    string: '#f06292',
    boolean: '#e53935',
    any: '#9e9e9e',
};

export const EXEC_COLOR = '#ffffff';

export const pinColor = (pin: PinDef): string => (pin.kind === 'exec' ? EXEC_COLOR : DATA_COLORS[pin.type]);
