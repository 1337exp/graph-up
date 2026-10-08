import { describe, expect, it } from 'vitest';
import { addNode, connect, createGraph, removeNode } from '@/graph/graph';
import { execute, ExecutionError } from '@/graph/execute';
import { canConnect, validateGraph } from '@/graph/validate';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

function setup() {
    const g = createGraph();
    const add = (type: string, id: string, values: Record<string, unknown> = {}) => addNode(g, registry, type, { id, values });
    return { g, add };
}

describe('реестр', () => {
    it('подхватывает ноды из файлов', () => {
        const ids = registry.all().map((d) => d.id).sort();
        expect(ids).toEqual([
            'debug/print',
            'flow/branch',
            'flow/for-loop',
            'flow/start',
            'math/add',
            'math/greater',
            'vars/get',
            'vars/set',
        ]);
    });
});

describe('соединения', () => {
    it('запрещает exec ↔ data и несовместимые типы', () => {
        const { g, add } = setup();
        add('flow/start', 's');
        add('math/add', 'a');
        add('debug/print', 'p');
        add('math/greater', 'gt');
        add('flow/branch', 'b');

        expect(canConnect(g, registry, { node: 's', pin: 'out' }, { node: 'a', pin: 'a' }).ok).toBe(false);
        expect(canConnect(g, registry, { node: 'gt', pin: 'result' }, { node: 'a', pin: 'a' }).ok).toBe(false); // boolean → number
        expect(canConnect(g, registry, { node: 'gt', pin: 'result' }, { node: 'p', pin: 'message' }).ok).toBe(true); // → any
        expect(canConnect(g, registry, { node: 'gt', pin: 'result' }, { node: 'b', pin: 'condition' }).ok).toBe(true);
        expect(canConnect(g, registry, { node: 'a', pin: 'result' }, { node: 'a', pin: 'a' }).ok).toBe(false); // сама в себя
    });

    it('запрещает циклы по данным, но не по exec', () => {
        const { g, add } = setup();
        add('math/add', 'a1');
        add('math/add', 'a2');
        connect(g, registry, { node: 'a1', pin: 'result' }, { node: 'a2', pin: 'a' });
        expect(canConnect(g, registry, { node: 'a2', pin: 'result' }, { node: 'a1', pin: 'a' }).ok).toBe(false);

        add('debug/print', 'p1');
        add('debug/print', 'p2');
        connect(g, registry, { node: 'p1', pin: 'out' }, { node: 'p2', pin: 'in' });
        expect(canConnect(g, registry, { node: 'p2', pin: 'out' }, { node: 'p1', pin: 'in' }).ok).toBe(true);
    });

    it('новая связь вытесняет старую на том же входе', () => {
        const { g, add } = setup();
        add('math/add', 'a1');
        add('math/add', 'a2');
        add('math/add', 'a3');
        connect(g, registry, { node: 'a1', pin: 'result' }, { node: 'a3', pin: 'a' });
        connect(g, registry, { node: 'a2', pin: 'result' }, { node: 'a3', pin: 'a' });
        expect(g.connections.map((c) => c.from.node)).toEqual(['a2']);
    });

    it('removeNode убирает связи ноды', () => {
        const { g, add } = setup();
        add('math/add', 'a1');
        add('math/add', 'a2');
        connect(g, registry, { node: 'a1', pin: 'result' }, { node: 'a2', pin: 'a' });
        removeNode(g, 'a1');
        expect(g.connections).toEqual([]);
        expect(validateGraph(g, registry)).toEqual([]);
    });
});

describe('исполнение', () => {
    it('Start → Print выводит значение из чистой ноды Add', async () => {
        const { g, add } = setup();
        add('flow/start', 's');
        add('math/add', 'sum', { a: 2, b: 3 });
        add('debug/print', 'p');
        connect(g, registry, { node: 's', pin: 'out' }, { node: 'p', pin: 'in' });
        connect(g, registry, { node: 'sum', pin: 'result' }, { node: 'p', pin: 'message' });

        const res = await execute(g, registry, 's');
        expect(res.logs).toEqual(['5']);
        expect(res.steps).toBe(2);
    });

    it('чистые ноды цепочкой: (1+2)+10', async () => {
        const { g, add } = setup();
        add('flow/start', 's');
        add('math/add', 'a1', { a: 1, b: 2 });
        add('math/add', 'a2', { b: 10 });
        add('debug/print', 'p');
        connect(g, registry, { node: 's', pin: 'out' }, { node: 'p', pin: 'in' });
        connect(g, registry, { node: 'a1', pin: 'result' }, { node: 'a2', pin: 'a' });
        connect(g, registry, { node: 'a2', pin: 'result' }, { node: 'p', pin: 'message' });

        expect((await execute(g, registry, 's')).logs).toEqual(['13']);
    });

    it('Branch выбирает ветку по условию', async () => {
        for (const [a, expected] of [[5, 'then'], [1, 'else']] as const) {
            const { g, add } = setup();
            add('flow/start', 's');
            add('math/greater', 'gt', { a, b: 3 });
            add('flow/branch', 'br');
            add('debug/print', 'yes', { message: 'then' });
            add('debug/print', 'no', { message: 'else' });
            connect(g, registry, { node: 's', pin: 'out' }, { node: 'br', pin: 'in' });
            connect(g, registry, { node: 'gt', pin: 'result' }, { node: 'br', pin: 'condition' });
            connect(g, registry, { node: 'br', pin: 'then' }, { node: 'yes', pin: 'in' });
            connect(g, registry, { node: 'br', pin: 'else' }, { node: 'no', pin: 'in' });

            expect((await execute(g, registry, 's')).logs).toEqual([expected]);
        }
    });

    it('exec-цикл останавливается по лимиту шагов', async () => {
        const { g, add } = setup();
        add('flow/start', 's');
        add('debug/print', 'p1');
        add('debug/print', 'p2');
        connect(g, registry, { node: 's', pin: 'out' }, { node: 'p1', pin: 'in' });
        connect(g, registry, { node: 'p1', pin: 'out' }, { node: 'p2', pin: 'in' });
        connect(g, registry, { node: 'p2', pin: 'out' }, { node: 'p1', pin: 'in' });

        await expect(execute(g, registry, 's', { maxSteps: 50 })).rejects.toBeInstanceOf(ExecutionError);
    });

    it('ошибка в ноде оборачивается с id ноды', async () => {
        const { g, add } = setup();
        add('flow/start', 's');
        add('debug/print', 'p');
        connect(g, registry, { node: 's', pin: 'out' }, { node: 'p', pin: 'in' });

        const err = await execute(g, registry, 'missing').catch((e) => e);
        expect(err).toBeInstanceOf(ExecutionError);
        expect(err.nodeId).toBe('missing');
    });
});
