import { isPure } from './define';
import type { Registry } from './registry';
import type { AnyNodeDef, DataType, Graph, NodeInstance, RunContext } from './types';

/** Причина остановки. По ней UI подбирает перевод; `message` — английский текст для разработчика. */
export type ExecutionErrorKind = 'limit' | 'depth' | 'aborted' | 'nodeNotFound' | 'dataCycle' | 'nodeError';

export class ExecutionError extends Error {
    constructor(
        message: string,
        readonly nodeId?: string,
        readonly kind: ExecutionErrorKind = 'nodeError',
        readonly params: Record<string, string | number> = {},
    ) {
        super(message);
        this.name = 'ExecutionError';
    }
}

export interface ExecuteOptions {
    /** Защита от бесконечных циклов: общее число шагов (выполненных нод и запусков тел циклов). */
    maxSteps?: number;
    /** Защита от бесконечной вложенности: цепочка внутри цепочки внутри цепочки… */
    maxDepth?: number;
    onLog?: (message: string, nodeId: string) => void;
    /** Вызывается перед выполнением каждой exec-ноды. */
    onStep?: (nodeId: string) => void;
    /** Остановка снаружи. */
    signal?: AbortSignal;
    /** Пауза между шагами, мс (чтобы было видно, как идёт исполнение). */
    stepDelay?: number;
}

/** Как часто (в шагах) отдавать управление браузеру, если пауз между шагами нет. */
const YIELD_EVERY = 100;

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface ExecuteResult {
    steps: number;
    logs: string[];
    /** Последние выходные значения каждой выполненной (exec) ноды. */
    outputs: Record<string, Record<string, unknown>>;
    /** Переменные на момент завершения. */
    vars: Record<string, unknown>;
}

/**
 * Приводит значение к типу пина. Нужно, потому что `any` (например, из переменной или текстового
 * поля) может прийти в `number`-пин строкой: без приведения `"0" + 1` дало бы `"01"`.
 */
export function coerce(type: DataType, value: unknown): unknown {
    if (value === undefined || type === 'any') return value;

    switch (type) {
        case 'number':
            return typeof value === 'number' ? value : Number(value);
        case 'string':
            return typeof value === 'string' ? value : String(value);
        case 'boolean':
            if (typeof value === 'boolean') return value;
            return !(value === 'false' || value === '0' || value === '' || !value);
    }
}

/**
 * Запускает граф с ноды `startNodeId`.
 *
 * Exec-ноды идут по цепочке exec-связей. Нода может запустить вложенную цепочку через `ctx.exec(pin)`
 * (так работают циклы). Чистые ноды (без exec-пинов) вычисляются лениво, когда кто-то запрашивает
 * их выход; результат кэшируется в пределах одного шага.
 */
export async function execute(
    graph: Graph,
    registry: Registry,
    startNodeId: string,
    options: ExecuteOptions = {},
): Promise<ExecuteResult> {
    const { maxSteps = 10_000, maxDepth = 100, onLog, onStep, signal, stepDelay = 0 } = options;

    const logs: string[] = [];
    const outputs: Record<string, Record<string, unknown>> = {};
    const vars = new Map<string, unknown>();
    let pureCache = new Map<string, Record<string, unknown>>();
    const evaluating = new Set<string>();
    let steps = 0;

    const nodeOf = (id: string): NodeInstance => {
        const node = graph.nodes[id];
        if (!node) throw new ExecutionError(`Node "${id}" not found`, id, 'nodeNotFound', { id });
        return node;
    };

    const linkFrom = (nodeId: string, pin: string) =>
        graph.connections.find((c) => c.from.node === nodeId && c.from.pin === pin);

    /** Один шаг исполнения: учёт лимита, остановка и периодическая отдача управления браузеру. */
    async function tick(nodeId: string, notify: boolean) {
        if (signal?.aborted) throw new ExecutionError('Aborted', nodeId, 'aborted');
        if (++steps > maxSteps) throw new ExecutionError(`Step limit exceeded (${maxSteps})`, nodeId, 'limit', { maxSteps });

        if (notify) onStep?.(nodeId);
        if (notify && stepDelay > 0) await new Promise<void>((resolve) => setTimeout(resolve, stepDelay));
        else if (steps % YIELD_EVERY === 0) await macrotask();

        if (signal?.aborted) throw new ExecutionError('Aborted', nodeId, 'aborted');
    }

    function makeCtx(node: NodeInstance, depth: number): RunContext {
        return {
            nodeId: node.id,
            vars,
            log(message) {
                logs.push(message);
                onLog?.(message, node.id);
            },
            setOutputs(values) {
                outputs[node.id] = { ...outputs[node.id], ...values };
            },
            async exec(pin) {
                // Шаг считается всегда, даже если тело пустое: цикл на миллиард итераций не должен зависнуть.
                await tick(node.id, false);
                const link = linkFrom(node.id, pin);
                if (link) await runChain(link.to.node, depth + 1);
            },
        };
    }

    async function resolveInputs(node: NodeInstance, def: AnyNodeDef): Promise<Record<string, unknown>> {
        const inputs: Record<string, unknown> = {};

        for (const [name, pin] of Object.entries(def.inputs)) {
            if (pin.kind !== 'data') continue;

            const conn = graph.connections.find((c) => c.to.node === node.id && c.to.pin === name);
            let value: unknown;

            if (!conn) {
                value = name in node.values ? node.values[name] : pin.default;
            } else {
                const source = nodeOf(conn.from.node);
                const sourceDef = registry.get(source.type);
                const produced = isPure(sourceDef) ? await evaluatePure(source, sourceDef) : outputs[source.id];
                value = produced?.[conn.from.pin];
            }

            inputs[name] = coerce(pin.type, value);
        }

        return inputs;
    }

    async function evaluatePure(node: NodeInstance, def: AnyNodeDef): Promise<Record<string, unknown>> {
        const cached = pureCache.get(node.id);
        if (cached) return cached;

        if (evaluating.has(node.id)) throw new ExecutionError('Data cycle', node.id, 'dataCycle');
        evaluating.add(node.id);

        try {
            const result = await def.run(await resolveInputs(node, def), makeCtx(node, 0));
            const out = (result.outputs ?? {}) as Record<string, unknown>;
            pureCache.set(node.id, out);
            return out;
        } catch (e) {
            throw wrapError(e, node.id);
        } finally {
            evaluating.delete(node.id);
        }
    }

    /** Выполняет цепочку нод, начиная с `startId`, пока не кончатся exec-связи. */
    async function runChain(startId: string, depth: number): Promise<void> {
        if (depth > maxDepth) throw new ExecutionError(`Nesting too deep (${maxDepth})`, startId, 'depth', { maxDepth });

        let current: string | null = startId;

        while (current !== null) {
            await tick(current, true);

            const node = nodeOf(current);
            const def = registry.get(node.type);
            pureCache = new Map(); // значения чистых нод считаем заново на каждом шаге

            let nextPin: string | undefined;
            try {
                const result = await def.run(await resolveInputs(node, def), makeCtx(node, depth));
                outputs[node.id] = { ...outputs[node.id], ...(result.outputs as Record<string, unknown> | undefined) };
                nextPin = result.next;
            } catch (e) {
                throw wrapError(e, node.id);
            }

            if (nextPin === undefined) {
                const execOutputs = Object.entries(def.outputs).filter(([, p]) => p.kind === 'exec');
                if (execOutputs.length === 1) nextPin = execOutputs[0]![0];
            }

            const link = nextPin === undefined ? undefined : linkFrom(node.id, nextPin);
            current = link ? link.to.node : null;
        }
    }

    await runChain(startNodeId, 0);

    return { steps, logs, outputs, vars: Object.fromEntries(vars) };
}

function wrapError(e: unknown, nodeId: string): ExecutionError {
    if (e instanceof ExecutionError) return e;
    const message = e instanceof Error ? e.message : String(e);
    return new ExecutionError(message, nodeId, 'nodeError', { message });
}
