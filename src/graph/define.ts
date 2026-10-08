import type { DataPinDef, DataType, DataTypeMap, ExecPinDef, NodeDef, PinDefs } from './types';

export function exec(label?: string): ExecPinDef {
    return label === undefined ? { kind: 'exec' } : { kind: 'exec', label };
}

export function data<T extends DataType>(type: T, defaultValue?: DataTypeMap[T], label?: string): DataPinDef<T> {
    const pin: DataPinDef<T> = { kind: 'data', type };
    if (defaultValue !== undefined) pin.default = defaultValue;
    if (label !== undefined) pin.label = label;
    return pin;
}

/** Просто выводит типы пинов в `run`. */
export function defineNode<I extends PinDefs, O extends PinDefs>(def: NodeDef<I, O>): NodeDef<I, O> {
    return def;
}

/** Нода «чистая», если у неё нет exec-пинов: считается лениво, по запросу. */
export function isPure(def: NodeDef): boolean {
    return ![...Object.values(def.inputs), ...Object.values(def.outputs)].some((p) => p.kind === 'exec');
}
