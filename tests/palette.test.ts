import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { categoryOf, filterNodes, findCompatiblePin, groupByCategory } from '@/editor/palette';
import { useEditor } from '@/editor/store';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();
const defs = registry.all();

describe('палитра: фильтр и группы', () => {
    it('ищет по названию и id, все слова должны совпасть', () => {
        expect(filterNodes(defs, 'add').map((d) => d.id)).toEqual(['math/add']);
        expect(filterNodes(defs, 'MATH').map((d) => d.id)).toEqual(['math/add', 'math/greater']);
        expect(filterNodes(defs, 'math gre').map((d) => d.id)).toEqual(['math/greater']);
        expect(filterNodes(defs, 'нет такой')).toEqual([]);
    });

    it('сортирует и группирует по категориям', () => {
        const groups = groupByCategory(filterNodes(defs, ''));
        expect(groups.map((g) => g.category)).toEqual(['debug', 'flow', 'math', 'vars']);
        expect(groups.every((g) => g.nodes.every((d) => categoryOf(d) === g.category))).toBe(true);
    });
});

describe('findCompatiblePin', () => {
    it('выход boolean → вход boolean предпочитается входу any', () => {
        const origin = registry.get('math/greater').outputs.result!;
        expect(findCompatiblePin(origin, 'out', registry.get('flow/branch'))).toBe('condition');
        expect(findCompatiblePin(origin, 'out', registry.get('debug/print'))).toBe('message'); // any
        expect(findCompatiblePin(origin, 'out', registry.get('math/add'))).toBeNull();
    });

    it('exec-выход → exec-вход, и наоборот для входа', () => {
        const execOut = registry.get('flow/start').outputs.out!;
        expect(findCompatiblePin(execOut, 'out', registry.get('debug/print'))).toBe('in');
        expect(findCompatiblePin(execOut, 'out', registry.get('math/add'))).toBeNull();

        const execIn = registry.get('debug/print').inputs.in!;
        expect(findCompatiblePin(execIn, 'in', registry.get('flow/start'))).toBe('out');
    });
});

describe('store: создание ноды из палитры', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('без origin просто добавляет ноду в позицию курсора и выделяет её', () => {
        const editor = useEditor();
        const before = Object.keys(editor.graph.nodes).length;
        editor.openPalette([10, 10], [500, 400]);
        editor.createFromPalette('math/add');

        expect(Object.keys(editor.graph.nodes).length).toBe(before + 1);
        const [id] = [...editor.selection];
        expect(editor.graph.nodes[id!]).toMatchObject({ type: 'math/add', x: 500, y: 400 });
        expect(editor.palette).toBeNull();
    });

    it('с origin подключает новую ноду к пину', () => {
        const editor = useEditor();
        const before = editor.graph.connections.length;

        // тянули от выхода Print.out → нужна нода с exec-входом
        editor.openPalette([0, 0], [700, 100], { ref: { node: 'yes', pin: 'out' }, dir: 'out' });
        expect(editor.fitsPaletteOrigin('debug/print')).toBe(true);
        expect(editor.fitsPaletteOrigin('math/add')).toBe(false);
        editor.createFromPalette('debug/print');

        expect(editor.graph.connections.length).toBe(before + 1);
        const added = editor.graph.connections.at(-1)!;
        expect(added.from).toEqual({ node: 'yes', pin: 'out' });
        expect(added.to.pin).toBe('in');
    });

    it('с origin-входом ставит ноду левее и подключает её выход', () => {
        const editor = useEditor();
        // Add.result (number) → вход Print.message (any), тянули от входа
        editor.openPalette([0, 0], [900, 300], { ref: { node: 'yes', pin: 'message' }, dir: 'in' });
        editor.createFromPalette('math/add');

        const added = editor.graph.connections.at(-1)!;
        expect(added.to).toEqual({ node: 'yes', pin: 'message' });
        expect(added.from.pin).toBe('result');
        expect(editor.graph.nodes[added.from.node]!.x).toBe(720);
    });
});
