import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { COALESCE_MS, History } from '@/editor/history';
import { useEditor } from '@/editor/store';

describe('History', () => {
    let time = 0;
    const make = (limit?: number) => new History('A', limit, () => time);
    beforeEach(() => (time = 0));

    it('undo/redo идут по записанным состояниям', () => {
        const h = make();
        h.commit('B');
        h.commit('C');

        expect(h.undo()).toBe('B');
        expect(h.undo()).toBe('A');
        expect(h.undo()).toBeNull(); // дальше начала не уходим
        expect(h.redo()).toBe('B');
        expect(h.redo()).toBe('C');
        expect(h.redo()).toBeNull();
    });

    it('canUndo / canRedo отражают положение', () => {
        const h = make();
        expect([h.canUndo, h.canRedo]).toEqual([false, false]);
        h.commit('B');
        expect([h.canUndo, h.canRedo]).toEqual([true, false]);
        h.undo();
        expect([h.canUndo, h.canRedo]).toEqual([false, true]);
    });

    it('одинаковое состояние не записывается', () => {
        const h = make();
        expect(h.commit('A')).toBe(false);
        expect(h.canUndo).toBe(false);
        h.commit('B');
        expect(h.commit('B')).toBe(false);
        expect(h.undo()).toBe('A');
    });

    it('новая правка после undo отбрасывает redo', () => {
        const h = make();
        h.commit('B');
        h.commit('C');
        h.undo(); // B
        h.commit('D');

        expect(h.canRedo).toBe(false);
        expect(h.undo()).toBe('B');
        expect(h.undo()).toBe('A');
    });

    it('быстрые правки с одним ключом склеиваются, с паузой — нет', () => {
        const h = make();
        h.commit('1', 'value');
        time += 100;
        h.commit('12', 'value');
        time += 100;
        h.commit('123', 'value');
        expect(h.undo()).toBe('A'); // три нажатия — один шаг

        h.redo();
        time += COALESCE_MS + 1;
        h.commit('1234', 'value');
        expect(h.undo()).toBe('123'); // после паузы — отдельный шаг
    });

    it('разные ключи не склеиваются', () => {
        const h = make();
        h.commit('B', 'x');
        h.commit('C', 'y');
        expect(h.undo()).toBe('B');
    });

    it('после undo склейка не продолжается', () => {
        const h = make();
        h.commit('B', 'k');
        h.undo();
        h.commit('C', 'k');
        expect(h.undo()).toBe('A');
        expect(h.canUndo).toBe(false);
    });

    it('вернули значение к исходному в рамках серии — записи нет', () => {
        const h = make();
        h.commit('B', 'k');
        time += 10;
        h.commit('A', 'k'); // вернулись к A
        expect(h.canUndo).toBe(false);
    });

    it('ограничивает глубину истории', () => {
        const h = make(3);
        for (const s of ['B', 'C', 'D', 'E', 'F']) h.commit(s);

        const seen: string[] = [];
        for (let s = h.undo(); s !== null; s = h.undo()) seen.push(s);
        expect(seen).toEqual(['E', 'D', 'C']); // старше трёх шагов — забыто
    });

    it('reset начинает историю заново', () => {
        const h = make();
        h.commit('B');
        h.reset('Z');
        expect([h.canUndo, h.canRedo]).toEqual([false, false]);
        h.commit('Y');
        expect(h.undo()).toBe('Z');
    });
});

describe('undo/redo в сторе', () => {
    beforeEach(() => setActivePinia(createPinia()));

    const nodeCount = (editor: ReturnType<typeof useEditor>) => Object.keys(editor.graph.nodes).length;

    it('в начале отменять нечего', () => {
        const editor = useEditor();
        expect([editor.canUndo, editor.canRedo]).toEqual([false, false]);
        expect(editor.undo()).toBe(false);
    });

    it('создание ноды из палитры отменяется и возвращается', () => {
        const editor = useEditor();
        const before = nodeCount(editor);

        editor.openPalette([0, 0], [500, 500]);
        editor.createFromPalette('math/add');
        expect(nodeCount(editor)).toBe(before + 1);
        expect(editor.canUndo).toBe(true);

        editor.undo();
        expect(nodeCount(editor)).toBe(before);
        expect(editor.canRedo).toBe(true);

        editor.redo();
        expect(nodeCount(editor)).toBe(before + 1);
    });

    it('удаление ноды возвращает и её связи', () => {
        const editor = useEditor();
        const links = editor.graph.connections.length;

        editor.setSelection(['branch']); // у Branch 4 связи
        editor.removeSelected();
        expect(editor.graph.nodes['branch']).toBeUndefined();
        expect(editor.graph.connections.length).toBeLessThan(links);

        editor.undo();
        expect(editor.graph.nodes['branch']).toBeDefined();
        expect(editor.graph.connections).toHaveLength(links);
    });

    it('перетаскивание — один шаг: commit после серии moveSelected', () => {
        const editor = useEditor();
        const { x, y } = editor.graph.nodes['start']!;

        editor.setSelection(['start']);
        for (let i = 0; i < 20; i++) editor.moveSelected(5, 2); // много событий pointermove
        editor.commit();

        expect(editor.graph.nodes['start']).toMatchObject({ x: x + 100, y: y + 40 });
        editor.undo();
        expect(editor.graph.nodes['start']).toMatchObject({ x, y });
        expect(editor.canUndo).toBe(false); // перетаскивание было единственным шагом
    });

    it('клик без сдвига ничего не записывает', () => {
        const editor = useEditor();
        editor.setSelection(['start']);
        editor.commit();
        expect(editor.canUndo).toBe(false);
    });

    it('соединение и снятие связи отменяются', () => {
        const editor = useEditor();
        const links = editor.graph.connections.length;

        editor.startConnect({ ref: { node: 'yes', pin: 'out' }, dir: 'out' }, [0, 0]);
        expect(editor.finishConnect({ ref: { node: 'no', pin: 'in' }, dir: 'in' })).toBe(true);
        expect(editor.graph.connections).toHaveLength(links + 1);

        editor.undo();
        expect(editor.graph.connections).toHaveLength(links);
    });

    it('«выдернутая» из входа связь, брошенная в пустоту, тоже отменяется', () => {
        const editor = useEditor();
        const links = editor.graph.connections.length;

        editor.startConnect({ ref: { node: 'branch', pin: 'condition' }, dir: 'in' }, [0, 0]);
        editor.finishConnect(null);
        expect(editor.graph.connections).toHaveLength(links - 1);

        editor.undo();
        expect(editor.graph.connections).toHaveLength(links);
    });

    it('набор значения в поле — один шаг, пауза — новый', () => {
        const editor = useEditor();
        const original = editor.graph.nodes['gt']!.values.a;

        editor.setValue('gt', 'a', 1);
        editor.setValue('gt', 'a', 12);
        editor.setValue('gt', 'a', 123);
        expect(editor.graph.nodes['gt']!.values.a).toBe(123);

        editor.undo();
        expect(editor.graph.nodes['gt']!.values.a).toBe(original);
    });

    it('смена типа переменной вместе со снятыми связями откатывается целиком', () => {
        const editor = useEditor();
        const sum = editor.graph.variables[0]!;
        const links = editor.graph.connections.length;

        const removed = editor.retypeVariable(sum.id, 'string');
        expect(removed).toBeGreaterThan(0);
        expect(editor.graph.connections).toHaveLength(links - removed);

        editor.undo();
        expect(editor.graph.variables[0]!.type).toBe('float');
        expect(editor.graph.connections).toHaveLength(links);
    });

    it('переменные: добавление, переименование, удаление отменяются по одному', () => {
        const editor = useEditor();
        const v = editor.addVariable();
        editor.renameVariable(v.id, 'counter');
        editor.removeVariable(v.id);
        expect(editor.graph.variables.find((x) => x.id === v.id)).toBeUndefined();

        editor.undo();
        expect(editor.graph.variables.find((x) => x.id === v.id)?.name).toBe('counter');
        editor.undo();
        expect(editor.graph.variables.find((x) => x.id === v.id)?.name).toBe('var');
        editor.undo();
        expect(editor.graph.variables.find((x) => x.id === v.id)).toBeUndefined();
    });

    it('после undo выделение не ссылается на исчезнувшие ноды, а выделенная связь сбрасывается', () => {
        const editor = useEditor();
        editor.openPalette([0, 0], [500, 500]);
        editor.createFromPalette('math/add');
        const created = [...editor.selection][0]!;
        expect(editor.selection.has(created)).toBe(true);

        editor.undo();
        expect(editor.selection.has(created)).toBe(false);

        editor.setSelection([]);
        editor.startConnect({ ref: { node: 'yes', pin: 'out' }, dir: 'out' }, [0, 0]);
        editor.finishConnect({ ref: { node: 'no', pin: 'in' }, dir: 'in' });
        const added = editor.graph.connections.at(-1)!.id;
        editor.selectConnection(added);
        editor.undo();
        expect(editor.selectedConnection).toBeNull();
    });

    it('undo закрывает палитру и сбрасывает незавершённое протягивание', () => {
        const editor = useEditor();
        editor.openPalette([0, 0], [500, 500]);
        editor.createFromPalette('math/add');

        editor.startConnect({ ref: { node: 'yes', pin: 'out' }, dir: 'out' }, [0, 0]);
        editor.openPalette([0, 0], [0, 0]);
        editor.undo();
        expect(editor.pending).toBeNull();
        expect(editor.palette).toBeNull();
    });
});
