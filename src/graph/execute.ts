import { isPure } from './define';
import type { Registry } from './registry';
import type { AnyNodeDef, Graph, NodeInstance } from './types';

/** Причина остановки. По ней UI подбирает перевод; `message` — английский текст для разработчика. */
export type ExecutionErrorKind = 'limit' | 'aborted' | 'nodeNotFound' | 'dataCycle' | 'nodeError';

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
    /** Защита от бесконечных exec-циклов. */
    maxSteps?: number;
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
}

/**
 * Запускает граф с ноды `startNodeId`.
 *
 * Exec-ноды идут по цепочке exec-связей. Чистые ноды (без exec-пинов) вычисляются
 * лениво, когда кто-то запрашивает их выход; результат кэшируется в пределах одного шага.
 */
export async function execute(
    graph: Graph,
    registry: Registry,
    startNodeId: string,
    options: ExecuteOptions = {},
): Promise<ExecuteResult> {
    const { maxSteps = 10_000, onLog, onStep, signal, stepDelay = 0 } = options;

    const logs: string[] = [];
    const outputs: Record<string, Record<string, unknown>> = {};
    let pureCache = new Map<string, Record<string, unknown>>();
    const evaluating = new Set<string>();

    const nodeOf = (id: string): NodeInstance => {
        const node = graph.nodes[id];
        if (!node) throw new ExecutionError(`Node "${id}" not found`, id, 'nodeNotFound', { id });
        return node;
    };

    const makeCtx = (nodeId: string) => ({
        nodeId,
        log(message: string) {
            logs.push(message);
            onLog?.(message, nodeId);
        },
    });

    async function resolveInputs(node: NodeInstance, def: AnyNodeDef): Promise<Record<string, unknown>> {
        const inputs: Record<string, unknown> = {};

        for (const [name, pin] of Object.entries(def.inputs)) {
            if (pin.kind !== 'data') continue;

            const conn = graph.connections.find((c) => c.to.node === node.id && c.to.pin === name);
            if (!conn) {
                inputs[name] = name in node.values ? node.values[name] : pin.default;
                continue;
            }

            const source = nodeOf(conn.from.node);
            const sourceDef = registry.get(source.type);
            const produced = isPure(sourceDef) ? await evaluatePure(source, sourceDef) : outputs[source.id];
            inputs[name] = produced?.[conn.from.pin];
        }

        return inputs;
    }

    async function evaluatePure(node: NodeInstance, def: AnyNodeDef): Promise<Record<string, unknown>> {
        const cached = pureCache.get(node.id);
        if (cached) return cached;

        if (evaluating.has(node.id)) throw new ExecutionError('Data cycle', node.id, 'dataCycle');
        evaluating.add(node.id);

        try {
            const result = await def.run(await resolveInputs(node, def), makeCtx(node.id));
            const out = (result.outputs ?? {}) as Record<string, unknown>;
            pureCache.set(node.id, out);
            return out;
        } catch (e) {
            throw wrapError(e, node.id);
        } finally {
            evaluating.delete(node.id);
        }
    }

    let current: string | null = startNodeId;
    let steps = 0;

    while (current !== null) {
        if (signal?.aborted) throw new ExecutionError('Aborted', current, 'aborted');
        if (++steps > maxSteps) throw new ExecutionError(`Step limit exceeded (${maxSteps})`, current, 'limit', { maxSteps });

        onStep?.(current);
        if (stepDelay > 0) await new Promise<void>((resolve) => setTimeout(resolve, stepDelay));
        else if (steps % YIELD_EVERY === 0) await macrotask();
        if (signal?.aborted) throw new ExecutionError('Aborted', current, 'aborted');

        const node = nodeOf(current);
        const def = registry.get(node.type);
        pureCache = new Map(); // значения чистых нод считаем заново на каждом шаге

        let nextPin: string | undefined;
        try {
            const result = await def.run(await resolveInputs(node, def), makeCtx(node.id));
            outputs[node.id] = (result.outputs ?? {}) as Record<string, unknown>;
            nextPin = result.next;
        } catch (e) {
            throw wrapError(e, node.id);
        }

        if (nextPin === undefined) {
            const execOutputs = Object.entries(def.outputs).filter(([, p]) => p.kind === 'exec');
            if (execOutputs.length === 1) nextPin = execOutputs[0]![0];
        }

        const link = nextPin === undefined ? undefined : graph.connections.find((c) => c.from.node === node.id && c.from.pin === nextPin);
        current = link ? link.to.node : null;
    }

    return { steps, logs, outputs };
}

function wrapError(e: unknown, nodeId: string): ExecutionError {
    if (e instanceof ExecutionError) return e;
    const message = e instanceof Error ? e.message : String(e);
    return new ExecutionError(message, nodeId, 'nodeError', { message });
}
