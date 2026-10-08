import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditor } from '@/editor/store';
import { useRun } from '@/editor/run';
import { addNode, connect, createGraph } from '@/graph/graph';
import { execute, ExecutionError } from '@/graph/execute';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

function loop() {
    const g = createGraph();
    for (const [type, id] of [['flow/start', 's'], ['debug/print', 'p1'], ['debug/print', 'p2']] as const) {
        addNode(g, registry, type, { id });
    }
    connect(g, registry, { node: 's', pin: 'out' }, { node: 'p1', pin: 'in' });
    connect(g, registry, { node: 'p1', pin: 'out' }, { node: 'p2', pin: 'in' });
    connect(g, registry, { node: 'p2', pin: 'out' }, { node: 'p1', pin: 'in' });
    return g;
}

describe('защита от бесконечных циклов', () => {
    it('лимит шагов: kind = limit', async () => {
        const err = await execute(loop(), registry, 's', { maxSteps: 30 }).catch((e) => e);
        expect(err).toBeInstanceOf(ExecutionError);
        expect(err.kind).toBe('limit');
    });

    it('AbortSignal останавливает цикл: kind = aborted', async () => {
        const controller = new AbortController();
        let steps = 0;
        const err = await execute(loop(), registry, 's', {
            maxSteps: 1_000_000,
            signal: controller.signal,
            onStep: () => {
                if (++steps === 250) controller.abort();
            },
        }).catch((e) => e);
        expect(err.kind).toBe('aborted');
        expect(steps).toBe(250);
    });
});

describe('run store', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('запускает демо-граф и пишет лог', async () => {
        const run = useRun();
        run.slow = false;
        await run.run();

        expect(run.running).toBe(false);
        expect(run.lines.filter((l) => l.kind === 'log').map((l) => l.text)).toEqual(['a > b']);
        expect(run.lines.at(-1)?.kind).toBe('info');
    });

    it('без Start пишет ошибку', async () => {
        const editor = useEditor();
        delete editor.graph.nodes['start'];
        const run = useRun();
        await run.run();
        expect(run.lines.at(-1)).toMatchObject({ kind: 'error' });
    });

    it('зацикленный граф останавливается лимитом и подсвечивает ноду с ошибкой', async () => {
        const editor = useEditor();
        // Print «yes» → Print «no» → Print «yes»: бесконечный exec-цикл
        connect(editor.graph, editor.registry, { node: 'yes', pin: 'out' }, { node: 'no', pin: 'in' });
        connect(editor.graph, editor.registry, { node: 'no', pin: 'out' }, { node: 'yes', pin: 'in' });

        const run = useRun();
        run.slow = false;
        await run.run();

        expect(run.lines.at(-1)).toMatchObject({ kind: 'error' });
        expect(run.errorNode).not.toBeNull();
    });
});
