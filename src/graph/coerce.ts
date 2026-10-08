import type { DataType } from './types';

/** Типы, которые можно дать переменной (`any` — только «подстановочный» тип пинов). */
export type ConcreteType = Exclude<DataType, 'any'>;

export const CONCRETE_TYPES: readonly ConcreteType[] = ['boolean', 'int', 'float', 'string'];

export const DEFAULT_BY_TYPE: Record<ConcreteType, unknown> = {
    boolean: false,
    int: 0,
    float: 0,
    string: '',
};

/**
 * Приводит значение к типу пина. Нужно, потому что `any` (например, из текстового поля) может прийти
 * в числовой пин строкой: без приведения `"0" + 1` дало бы `"01"`.
 */
export function coerce(type: DataType, value: unknown): unknown {
    if (value === undefined || type === 'any') return value;

    switch (type) {
        case 'int': {
            const n = typeof value === 'number' ? value : Number(value);
            return Number.isNaN(n) ? n : Math.trunc(n);
        }
        case 'float':
            return typeof value === 'number' ? value : Number(value);
        case 'string':
            return typeof value === 'string' ? value : String(value);
        case 'boolean':
            if (typeof value === 'boolean') return value;
            return !(value === 'false' || value === '0' || value === '' || !value);
    }
}
