import type { ConcreteType } from './coerce';

// Типы пинов и значений.

export interface DataTypeMap {
    int: number;
    float: number;
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

export interface RunContext<O extends PinDefs = PinDefs> {
    nodeId: string;
    log(message: string): void;
    /**
     * Выполняет цепочку, начинающуюся с exec-выхода `pin`, до конца и возвращается.
     * Так ноды запускают «тело» (циклы). Если к пину ничего не подключено, ничего не делает.
     */
    exec(pin: ExecNames<O>): Promise<void>;
    /** Публикует значения data-выходов сразу, не дожидаясь конца `run` (нужно, чтобы тело цикла видело индекс). */
    setOutputs(values: Partial<DataValues<O>>): void;
    /** Переменные текущего запуска по id переменной. */
    vars: Map<string, unknown>;
    /** Настройки экземпляра ноды (`NodeInstance.config`), например `variable`. */
    config: Record<string, unknown>;
}

export interface RunResult<O extends PinDefs> {
    /** Значения data-выходов. */
    outputs?: Partial<DataValues<O>>;
    /** Какой exec-выход активировать. Если у ноды он единственный, можно не указывать. */
    next?: ExecNames<O>;
}

/** Пины и подпись, вычисленные по экземпляру ноды: накладываются поверх статических `inputs`/`outputs`. */
export interface PinOverrides {
    inputs?: PinDefs;
    outputs?: PinDefs;
    subtitle?: string;
}

export interface NodeDef<I extends PinDefs = PinDefs, O extends PinDefs = PinDefs> {
    id: string;
    title: string;
    inputs: I;
    outputs: O;
    /** Нода не показывается в палитре (создаётся другим способом, например Get/Set из панели переменных). */
    hidden?: boolean;
    /** Для нод, чьи пины зависят от экземпляра (тип переменной). Методом: см. ниже про присваиваемость. */
    resolve?(node: NodeInstance, graph: Graph): PinOverrides;
    // Методом, а не свойством-функцией: так NodeDef<конкретный> присваивается NodeDef<общий>.
    run(inputs: DataValues<I>, ctx: RunContext<O>): RunResult<O> | Promise<RunResult<O>>;
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
    /** Настройки, не относящиеся к пинам (у Get/Set Variable: id переменной). */
    config?: Record<string, unknown>;
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

/** Переменная графа. Типизирована: тип определяет пины нод Get/Set и их цвет. */
export interface Variable {
    id: string;
    name: string;
    type: ConcreteType;
    default: unknown;
}

export interface Graph {
    nodes: Record<string, NodeInstance>;
    connections: Connection[];
    variables: Variable[];
}
