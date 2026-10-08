import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditor } from '@/editor/store';
import { useRun } from '@/editor/run';
import { coerce, execute, ExecutionError } from '@/graph/execute';
import { addNode, connect, createGraph } from '@/graph/graph';
import { addVariable } from '@/graph/variables';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

function setup() {
    const g = createGraph();
    const add = (type: string, id: string, values: Record<string, unknown> = {}, variable?: string) =>
        addNode(g, registry, type, { id, values, ...(variable ? { config: { variable } } : {}) });
    const link = (a: string, ap: string, b: string, bp: string) =>
        connect(g, registry, { node: a, pin: ap }, { node: b, pin: bp });
    return { g, add, link };
}

/** sum = first + … + last, результат печатается после цикла. */
function sumGraph(first: number, last: number) {
    const { g, add, link } = setup();
    const sum = addVariable(g, { name: 'sum', type: 'float' });

    add('flow/start', 's');
    add('vars/set', 'init', { value: 0 }, sum.id);
    add('flow/for-loop', 'loop', { first, last });
    add('vars/set', 'acc', {}, sum.id);
    add('vars/get', 'read', {}, sum.id);
    add('math/add', 'plus');
    add('debug/print', 'out');
    add('vars/get', 'readOut', {}, sum.id);

    link('s', 'out', 'init', 'in');
    link('init', 'out', 'loop', 'in');
    link('loop', 'body', 'acc', 'in');
    link('loop', 'completed', 'out', 'in');
    link('read', 'value', 'plus', 'a');
    link('loop', 'index', 'plus', 'b'); // int → float
    link('plus', 'result', 'acc', 'value');
    link('readOut', 'value', 'out', 'message');
    return { g, sumId: sum.id };
}

describe('For Loop и переменные', () => {
    it('суммирует 1..5 = 15', async () => {
        const { g, sumId } = sumGraph(1, 5);
        const res = await execute(g, registry, 's');
        expect(res.logs).toEqual(['15']);
        expect(res.vars).toEqual({ [sumId]: 15 });
    });

    it('диапазон включает обе границы и может быть пустым', async () => {
        expect((await execute(sumGraph(3, 3).g, registry, 's')).logs).toEqual(['3']);
        expect((await execute(sumGraph(5, 1).g, registry, 's')).logs).toEqual(['0']);
    });

    it('индекс виден телу цикла (Print в теле)', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('flow/for-loop', 'loop', { first: 0, last: 2 });
        add('debug/print', 'p');
        link('s', 'out', 'loop', 'in');
        link('loop', 'body', 'p', 'in');
        link('loop', 'index', 'p', 'message');

        expect((await execute(g, registry, 's')).logs).toEqual(['0', '1', '2']);
    });

    it('вложенные циклы: 3 × 2 итерации', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('flow/for-loop', 'outer', { first: 1, last: 3 });
        add('flow/for-loop', 'inner', { first: 1, last: 2 });
        add('debug/print', 'p', { message: 'x' });
        link('s', 'out', 'outer', 'in');
        link('outer', 'body', 'inner', 'in');
        link('inner', 'body', 'p', 'in');

        expect((await execute(g, registry, 's')).logs).toHaveLength(6);
    });

    it('Get работает без Set: переменная стартует со значения по умолчанию', async () => {
        const { g, add, link } = setup();
        const v = addVariable(g, { name: 'greeting', type: 'string', default: 'hello' });
        add('flow/start', 's');
        add('vars/get', 'get', {}, v.id);
        add('debug/print', 'p');
        link('s', 'out', 'p', 'in');
        link('get', 'value', 'p', 'message');

        expect((await execute(g, registry, 's')).logs).toEqual(['hello']);
    });

    it('удалённая переменная — ошибка ноды с её id', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('vars/get', 'get', {}, 'v-missing');
        add('debug/print', 'p');
        link('s', 'out', 'p', 'in');
        link('get', 'value', 'p', 'message');

        const err = await execute(g, registry, 's').catch((e) => e);
        expect(err).toBeInstanceOf(ExecutionError);
        expect(err.kind).toBe('nodeError');
        expect(err.nodeId).toBe('get');
    });
});

describe('защита циклов', () => {
    it('пустое тело на огромном диапазоне не вешает, а упирается в лимит шагов', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('flow/for-loop', 'loop', { first: 0, last: 1_000_000_000 }); // body ни к чему не подключён
        link('s', 'out', 'loop', 'in');

        const err = await execute(g, registry, 's', { maxSteps: 500 }).catch((e) => e);
        expect(err.kind).toBe('limit');
    });

    it('тело замкнуто на вход цикла: упираемся в лимит глубины, а не растём бесконечно', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('flow/for-loop', 'loop', { first: 0, last: 5 });
        add('debug/print', 'p');
        link('s', 'out', 'loop', 'in');
        link('loop', 'body', 'p', 'in');
        link('p', 'out', 'loop', 'in');

        const err = await execute(g, registry, 's', { maxDepth: 20, maxSteps: 1_000_000 }).catch((e) => e);
        expect(err.kind).toBe('depth');
    });
});

describe('coerce', () => {
    it('приводит значения к типу пина', () => {
        expect(coerce('float', '0.5')).toBe(0.5);
        expect(coerce('int', '7.9')).toBe(7);
        expect(coerce('int', -2.5)).toBe(-2);
        expect(coerce('string', 5)).toBe('5');
        expect(coerce('boolean', 'false')).toBe(false);
        expect(coerce('boolean', 'true')).toBe(true);
        expect(coerce('any', '5')).toBe('5');
        expect(coerce('float', undefined)).toBeUndefined();
    });

    it('строка из поля ввода не склеивается как строка при сложении', async () => {
        const { g, add, link } = setup();
        add('flow/start', 's');
        add('math/add', 'plus', { a: '10', b: 1 }); // «10» — строка, как приходит из текстового поля
        add('debug/print', 'p');
        link('s', 'out', 'p', 'in');
        link('plus', 'result', 'p', 'message');

        expect((await execute(g, registry, 's')).logs).toEqual(['11']);
    });
});

describe('демо-граф и выбор Start', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('по умолчанию запускается первый Start', async () => {
        const run = useRun();
        run.slow = false;
        await run.run();
        expect(run.lines.filter((l) => l.kind === 'log').map((l) => (l as { text: string }).text)).toEqual(['a > b']);
    });

    it('выделенный Start запускается вместо первого: сумма 1..5', async () => {
        const editor = useEditor();
        editor.setSelection(['start2']);

        const run = useRun();
        run.slow = false;
        await run.run();
        expect(run.lines.filter((l) => l.kind === 'log').map((l) => (l as { text: string }).text)).toEqual(['15']);
    });
});
