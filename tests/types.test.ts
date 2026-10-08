import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { pinColor } from '@/editor/colors';
import { filterNodes } from '@/editor/palette';
import { useEditor } from '@/editor/store';
import { addNode, connect, createGraph } from '@/graph/graph';
import { pinOf, resolvePins } from '@/graph/pins';
import { canConnect, validateGraph } from '@/graph/validate';
import { addVariable, removeVariable, setVariableType } from '@/graph/variables';
import { data, exec } from '@/graph/define';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

function setup() {
    const g = createGraph();
    const add = (type: string, id: string, variable?: string) =>
        addNode(g, registry, type, { id, ...(variable ? { config: { variable } } : {}) });
    const can = (a: string, ap: string, b: string, bp: string) =>
        canConnect(g, registry, { node: a, pin: ap }, { node: b, pin: bp });
    return { g, add, can };
}

describe('совместимость типов', () => {
    it('int → float можно, float → int нельзя', () => {
        const { add, can } = setup();
        add('flow/for-loop', 'loop'); // index: int
        add('math/add', 'add'); // a, b: float; result: float

        expect(can('loop', 'index', 'add', 'a').ok).toBe(true);

        // float → int: вход first у For Loop имеет тип int
        const res = can('add', 'result', 'loop', 'first');
        expect(res.ok).toBe(false);
    });

    it('boolean, string и числа несовместимы друг с другом', () => {
        const { add, can } = setup();
        add('math/greater', 'gt'); // boolean
        add('math/add', 'add'); // float

        expect(can('gt', 'result', 'add', 'a').ok).toBe(false);
        expect(can('add', 'result', 'gt', 'a').ok).toBe(true); // float → float
    });

    it('у типов разные цвета, у int и float — тоже', () => {
        const colors = (['int', 'float', 'string', 'boolean', 'any'] as const).map((type) => pinColor(data(type)));
        expect(new Set(colors).size).toBe(5);
        expect(pinColor(exec())).toBe('#ffffff');
    });
});

describe('типизированные переменные', () => {
    it('пины Get/Set берут тип у переменной, цвет следует за типом', () => {
        const { g, add } = setup();
        const count = addVariable(g, { name: 'count', type: 'int' });
        add('vars/get', 'get', count.id);
        add('vars/set', 'set', count.id);

        expect(pinOf(registry, g, { node: 'get', pin: 'value' }, 'out')).toMatchObject({ kind: 'data', type: 'int' });
        expect(pinOf(registry, g, { node: 'set', pin: 'value' }, 'in')).toMatchObject({ kind: 'data', type: 'int' });
        expect(resolvePins(registry, g, g.nodes.get!).subtitle).toBe('count');
    });

    it('Get int можно вести в float, но нельзя в Set string', () => {
        const { g, add, can } = setup();
        const n = addVariable(g, { name: 'n', type: 'int' });
        const label = addVariable(g, { name: 'label', type: 'string' });
        add('vars/get', 'getN', n.id);
        add('vars/set', 'setLabel', label.id);
        add('math/add', 'add');

        expect(can('getN', 'value', 'add', 'a').ok).toBe(true);
        expect(can('getN', 'value', 'setLabel', 'value').ok).toBe(false);
    });

    it('смена типа приводит значение по умолчанию и снимает недопустимые связи', () => {
        const { g, add } = setup();
        const v = addVariable(g, { name: 'v', type: 'int', default: 7 });
        add('vars/get', 'get', v.id);
        add('flow/for-loop', 'loop');
        connect(g, registry, { node: 'get', pin: 'value' }, { node: 'loop', pin: 'first' }); // int → int

        // int → float: связь с int-входом больше не допустима
        const removed = setVariableType(g, registry, v.id, 'float');
        expect(removed).toBe(1);
        expect(g.connections).toEqual([]);
        expect(v.default).toBe(7);
        expect(validateGraph(g, registry)).toEqual([]);

        // float → string: значение приводится
        setVariableType(g, registry, v.id, 'string');
        expect(v.default).toBe('7');
    });

    it('нетронутое значение по умолчанию получает стандартное значение нового типа', () => {
        const { g } = setup();
        const v = addVariable(g, { name: 'v', type: 'float' }); // default 0 — не трогали
        setVariableType(g, registry, v.id, 'string');
        expect(v.default).toBe('');

        setVariableType(g, registry, v.id, 'boolean');
        expect(v.default).toBe(false);
    });

    it('смена типа на совместимый не трогает связи', () => {
        const { g, add } = setup();
        const v = addVariable(g, { name: 'v', type: 'int' });
        add('vars/get', 'get', v.id);
        add('math/add', 'add');
        connect(g, registry, { node: 'get', pin: 'value' }, { node: 'add', pin: 'a' }); // int → float

        expect(setVariableType(g, registry, v.id, 'float')).toBe(0); // float → float
        expect(g.connections).toHaveLength(1);
    });

    it('удаление переменной не удаляет ноды: они остаются «сломанными» с any-пином', () => {
        const { g, add } = setup();
        const v = addVariable(g, { name: 'v', type: 'float' });
        add('vars/get', 'get', v.id);
        removeVariable(g, v.id);

        expect(g.nodes.get).toBeDefined();
        expect(pinOf(registry, g, { node: 'get', pin: 'value' }, 'out')).toMatchObject({ type: 'any' });
        expect(resolvePins(registry, g, g.nodes.get!).subtitle).toBeUndefined();
    });

    it('имена переменных остаются уникальными', () => {
        const g = createGraph();
        expect(addVariable(g).name).toBe('var');
        expect(addVariable(g).name).toBe('var2');
        expect(addVariable(g, { name: 'var' }).name).toBe('var3');
    });
});

describe('store: переменные', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('Get/Set создаются в центре видимой области и выделяются', () => {
        const editor = useEditor();
        editor.viewport = { w: 1000, h: 600 };
        editor.camera = { x: 100, y: 50, z: 2 };

        const v = editor.addVariable();
        const node = editor.addVariableNode('get', v.id);

        // центр экрана (500, 300) → мир ((500-100)/2, (300-50)/2)
        expect(node).toMatchObject({ type: 'vars/get', x: 200, y: 125, config: { variable: v.id } });
        expect([...editor.selection]).toEqual([node.id]);
    });

    it('retypeVariable возвращает число снятых связей, setVariableDefault приводит значение', () => {
        const editor = useEditor();
        const sum = editor.graph.variables.find((x) => x.name === 'sum')!;
        expect(sum.type).toBe('float');

        editor.setVariableDefault(sum.id, '2.5');
        expect(sum.default).toBe(2.5);
        editor.setVariableDefault(sum.id, 'не число'); // мусор игнорируется
        expect(sum.default).toBe(2.5);

        // в демо sum (float) ведёт связи в add.a (float), print.message (any) и от add.result → set.value
        expect(editor.retypeVariable(sum.id, 'string')).toBeGreaterThan(0);
    });

    it('палитра не показывает Get/Set: они создаются из панели переменных', () => {
        const defs = useEditor().registry.all();
        expect(defs.some((d) => d.id === 'vars/get')).toBe(true); // нода в реестре есть
        expect(filterNodes(defs, '').some((d) => d.id.startsWith('vars/'))).toBe(false);
        expect(filterNodes(defs, 'get')).toEqual([]);
    });
});
