// Типы пинов и значений.

export interface DataTypeMap {
    number: number;
    string: string;
    boolean: boolean;
    any: unknown;
}

export type DataType = keyof DataTypeMap;

export interface ExecPinDef {
    kind: 'exec';
    label?: string;
}

export interface DataPinDef<T extends DataType = DataType> {
    kind: 'data';
    type: T;
    /** Значение, если пин не подключён и на ноде не задано своё. */
    default?: DataTypeMap[T];
    label?: string;
}

export type PinDef = ExecPinDef | DataPinDef;
export type PinDefs = Record<string, PinDef>;

//--------------------------------------------------
// Определение ноды (живёт в реестре, содержит код)

/** Имена только data-пинов → их TS-типы. */
export type DataValues<P extends PinDefs> = {
    [K in keyof P as P[K] extends DataPinDef ? K : never]: P[K] extends DataPinDef<infer T> ? DataTypeMap[T] : never;
};

export type ExecNames<P extends PinDefs> = {
    [K in keyof P]: P[K] extends ExecPinDef ? K : never;
}[keyof P] & string;

export interface RunContext {
    nodeId: string;
    log(message: string): void;
}

export interface RunResult<O extends PinDefs> {
    /** Значения data-выходов. */
    outputs?: Partial<DataValues<O>>;
    /** Какой exec-выход активировать. Если у ноды он единственный, можно не указывать. */
    next?: ExecNames<O>;
}

export interface NodeDef<I extends PinDefs = PinDefs, O extends PinDefs = PinDefs> {
    id: string;
    title: string;
    inputs: I;
    outputs: O;
    // Методом, а не свойством-функцией: так NodeDef<конкретный> присваивается NodeDef<общий>.
    run(inputs: DataValues<I>, ctx: RunContext): RunResult<O> | Promise<RunResult<O>>;
}

export type AnyNodeDef = NodeDef<PinDefs, PinDefs>;

//--------------------------------------------------
// Граф (чистые данные, сериализуется в JSON)

export interface NodeInstance {
    id: string;
    /** id определения в реестре. */
    type: string;
    x: number;
    y: number;
    /** Значения неподключённых data-входов, заданные пользователем. */
    values: Record<string, unknown>;
}

export interface PinRef {
    node: string;
    pin: string;
}

export interface Connection {
    id: string;
    from: PinRef; // выход
    to: PinRef; // вход
}

export interface Graph {
    nodes: Record<string, NodeInstance>;
    connections: Connection[];
}
