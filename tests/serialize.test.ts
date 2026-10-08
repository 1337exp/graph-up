import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditor } from '@/editor/store';
import { FORMAT, parse, serialize, VERSION } from '@/graph/serialize';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

/** Минимальный валидный файл: две ноды и одна связь. */
function validFile(patch: (file: any) => void = () => {}): string {
    const file: any = {
        format: FORMAT,
        version: VERSION,
        graph: {
            nodes: {
                s: { id: 's', type: 'flow/start', x: 0, y: 0, values: {} },
                p: { id: 'p', type: 'debug/print', x: 200, y: 0, values: { message: 'hi' } },
            },
            connections: [{ id: 'c1', from: { node: 's', pin: 'out' }, to: { node: 'p', pin: 'in' } }],
            variables: [],
        },
    };
    patch(file);
    return JSON.stringify(file);
}

const errorOf = (text: string) => {
    const r = parse(text, registry);
    if (r.ok) throw new Error('ожидалась ошибка');
    return r.error;
};

describe('serialize / parse', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('демо-граф переживает круговой обмен без потерь', () => {
        const { graph } = useEditor();
        const text = serialize(graph, { x: 10, y: -20, z: 1.5 });

        const result = parse(text, registry);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.graph).toEqual(JSON.parse(JSON.stringify(graph)));
        expect(result.droppedConnections).toBe(0);
        expect(result.view).toEqual({ x: 10, y: -20, z: 1.5 });
    });

    it('файл помечен форматом и версией', () => {
        const parsed = JSON.parse(serialize(useEditor().graph));
        expect(parsed).toMatchObject({ format: 'graph-up', version: VERSION });
    });

    it('компактный вариант короче форматированного', () => {
        const { graph } = useEditor();
        expect(serialize(graph, undefined, false).length).toBeLessThan(serialize(graph).length);
    });

    it('принимает минимальный файл; variables и values необязательны', () => {
        const r = parse(
            validFile((f) => {
                delete f.graph.variables;
                delete f.graph.nodes.s.values;
            }),
            registry,
        );
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.graph.nodes.s!.values).toEqual({});
    });
});

describe('parse: отказ целиком', () => {
    it.each([
        ['не JSON', '{oops', 'invalidJson'],
        ['чужой JSON', '{"hello":1}', 'notGraphFile'],
        ['массив вместо объекта', '[]', 'notGraphFile'],
        ['null', 'null', 'notGraphFile'],
    ])('%s', (_name, text, code) => {
        expect(errorOf(text).code).toBe(code);
    });

    it('версия новее нашей', () => {
        const e = errorOf(validFile((f) => (f.version = VERSION + 1)));
        expect(e).toEqual({ code: 'newerVersion', detail: String(VERSION + 1) });
    });

    it.each([
        ['нет версии', (f: any) => delete f.version],
        ['версия строкой', (f: any) => (f.version = '1')],
        ['версия 0', (f: any) => (f.version = 0)],
        ['версия дробная', (f: any) => (f.version = 1.5)],
        ['нет graph', (f: any) => delete f.graph],
        ['nodes массивом', (f: any) => (f.graph.nodes = [])],
        ['connections объектом', (f: any) => (f.graph.connections = {})],
        ['variables строкой', (f: any) => (f.graph.variables = 'x')],
        ['id ноды не совпадает с ключом', (f: any) => (f.graph.nodes.s.id = 'other')],
        ['x не число', (f: any) => (f.graph.nodes.s.x = '0')],
        ['x бесконечность (null после JSON)', (f: any) => (f.graph.nodes.s.x = null)],
        ['у ноды нет типа', (f: any) => delete f.graph.nodes.s.type],
        ['values не объект', (f: any) => (f.graph.nodes.s.values = 5)],
        ['связь без from', (f: any) => delete f.graph.connections[0].from],
        ['пин связи не строка', (f: any) => (f.graph.connections[0].to.pin = 3)],
        ['дубликат id связи', (f: any) => f.graph.connections.push({ ...f.graph.connections[0] })],
        ['неизвестный тип переменной', (f: any) => (f.graph.variables = [{ id: 'v', name: 'x', type: 'any', default: 0 }])],
        ['дубликат id переменной', (f: any) => (f.graph.variables = [{ id: 'v', name: 'a', type: 'int' }, { id: 'v', name: 'b', type: 'int' }])],
    ])('повреждённая структура: %s', (_name, patch) => {
        expect(errorOf(validFile(patch)).code).toBe('invalidStructure');
    });

    it('неизвестная нода называется в ошибке', () => {
        const e = errorOf(validFile((f) => (f.graph.nodes.p.type = 'mod/ghost')));
        expect(e).toEqual({ code: 'unknownNode', detail: 'mod/ghost' });
    });

    it('id, которыми можно подменить прототип, отклоняются', () => {
        const text = validFile().replace('"s":', '"__proto__":').replace('"id":"s"', '"id":"__proto__"');
        expect(errorOf(text).code).toBe('invalidStructure');
        expect(({} as any).type).toBeUndefined(); // прототип Object не тронут
    });
});

describe('parse: мягкие случаи', () => {
    it('связи на несуществующие ноды и пины отбрасываются, граф открывается', () => {
        const r = parse(
            validFile((f) => {
                f.graph.connections.push(
                    { id: 'c2', from: { node: 'ghost', pin: 'out' }, to: { node: 'p', pin: 'in' } },
                    { id: 'c3', from: { node: 's', pin: 'nope' }, to: { node: 'p', pin: 'in' } },
                );
            }),
            registry,
        );
        expect(r.ok && r.droppedConnections).toBe(2);
        expect(r.ok && r.graph.connections.map((c) => c.id)).toEqual(['c1']);
    });

    it('несовместимые типы отбрасываются', () => {
        const r = parse(
            validFile((f) => {
                f.graph.nodes.gt = { id: 'gt', type: 'math/greater', x: 0, y: 100, values: {} };
                f.graph.nodes.add = { id: 'add', type: 'math/add', x: 0, y: 200, values: {} };
                // boolean → float: нельзя
                f.graph.connections.push({ id: 'bad', from: { node: 'gt', pin: 'result' }, to: { node: 'add', pin: 'a' } });
            }),
            registry,
        );
        expect(r.ok && r.droppedConnections).toBe(1);
    });

    it('две связи в один data-вход: остаётся первая', () => {
        const r = parse(
            validFile((f) => {
                f.graph.nodes.a1 = { id: 'a1', type: 'math/add', x: 0, y: 100, values: {} };
                f.graph.nodes.a2 = { id: 'a2', type: 'math/add', x: 0, y: 200, values: {} };
                f.graph.nodes.a3 = { id: 'a3', type: 'math/add', x: 0, y: 300, values: {} };
                f.graph.connections.push(
                    { id: 'first', from: { node: 'a1', pin: 'result' }, to: { node: 'a3', pin: 'a' } },
                    { id: 'second', from: { node: 'a2', pin: 'result' }, to: { node: 'a3', pin: 'a' } },
                );
            }),
            registry,
        );
        expect(r.ok && r.graph.connections.map((c) => c.id)).toEqual(['c1', 'first']);
        expect(r.ok && r.droppedConnections).toBe(1);
    });

    it('два выхода из одного exec-пина: остаётся первый', () => {
        const r = parse(
            validFile((f) => {
                f.graph.nodes.p2 = { id: 'p2', type: 'debug/print', x: 400, y: 0, values: {} };
                f.graph.connections.push({ id: 'dup', from: { node: 's', pin: 'out' }, to: { node: 'p2', pin: 'in' } });
            }),
            registry,
        );
        expect(r.ok && r.graph.connections.map((c) => c.id)).toEqual(['c1']);
    });

    it('в exec-вход можно вести несколько связей (слияние потоков)', () => {
        const r = parse(
            validFile((f) => {
                f.graph.nodes.s2 = { id: 's2', type: 'flow/start', x: 0, y: 100, values: {} };
                f.graph.connections.push({ id: 'merge', from: { node: 's2', pin: 'out' }, to: { node: 'p', pin: 'in' } });
            }),
            registry,
        );
        expect(r.ok && r.droppedConnections).toBe(0);
    });

    it('значение переменной приводится к её типу, мусор заменяется стандартным', () => {
        const r = parse(
            validFile((f) => {
                f.graph.variables = [
                    { id: 'a', name: 'a', type: 'int', default: '7.9' },
                    { id: 'b', name: 'b', type: 'float', default: 'не число' },
                    { id: 'c', name: 'c', type: 'string' },
                    { id: 'd', name: 'd', type: 'boolean', default: 'false' },
                ];
            }),
            registry,
        );
        expect(r.ok && r.graph.variables.map((v) => v.default)).toEqual([7, 0, '', false]);
    });

    it('нода с удалённой переменной (config.variable в никуда) открывается', () => {
        const r = parse(
            validFile((f) => (f.graph.nodes.g = { id: 'g', type: 'vars/get', x: 0, y: 0, values: {}, config: { variable: 'gone' } })),
            registry,
        );
        expect(r.ok).toBe(true);
    });

    it('неверная камера игнорируется, но граф открывается', () => {
        const r = parse(validFile((f) => (f.view = { x: 0, y: 0, z: -1 })), registry);
        expect(r.ok && r.view).toBeUndefined();
    });

    it('лишние поля в файле не попадают в граф', () => {
        const r = parse(
            validFile((f) => {
                f.graph.nodes.s.evil = '<script>';
                f.extra = 1;
            }),
            registry,
        );
        expect(r.ok && Object.keys(r.graph.nodes.s!)).toEqual(['id', 'type', 'x', 'y', 'values']);
    });
});
