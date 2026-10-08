import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { readSaved } from '@/editor/persistence';
import { useEditor } from '@/editor/store';
import { createGraph } from '@/graph/graph';

const SAVED_KEY = 'graph-up.graph';

/** Простое хранилище в памяти: можно посчитать записи и сымитировать переполнение квоты. */
function memoryStorage() {
    const data = new Map<string, string>();
    return {
        writes: 0,
        failWrites: false,
        getItem: (k: string) => data.get(k) ?? null,
        setItem(this: { writes: number; failWrites: boolean }, k: string, v: string) {
            if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
            this.writes++;
            data.set(k, v);
        },
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
    };
}

describe('файлы: экспорт и импорт', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('экспорт → импорт в «чистый» редактор восстанавливает граф', () => {
        const a = useEditor();
        a.openPalette([0, 0], [900, 900]);
        a.createFromPalette('math/add');
        const text = a.exportText();

        setActivePinia(createPinia());
        const b = useEditor();
        expect(b.importText(text)).toBeNull();
        expect(JSON.parse(JSON.stringify(b.graph))).toEqual(JSON.parse(JSON.stringify(a.graph)));
        expect(b.notice).toMatchObject({ kind: 'info', key: 'file.loaded' });
    });

    it('импорт можно отменить: прежний граф возвращается', () => {
        const editor = useEditor();
        const before = JSON.stringify(editor.graph);

        editor.importText(JSON.stringify({ format: 'graph-up', version: 1, graph: { nodes: {}, connections: [], variables: [] } }));
        expect(Object.keys(editor.graph.nodes)).toHaveLength(0);

        editor.undo();
        expect(JSON.stringify(editor.graph)).toBe(before);
    });

    it('битый файл не меняет граф и показывает ошибку', () => {
        const editor = useEditor();
        const before = JSON.stringify(editor.graph);

        const error = editor.importText('{broken');
        expect(error).toEqual({ code: 'invalidJson' });
        expect(JSON.stringify(editor.graph)).toBe(before);
        expect(editor.canUndo).toBe(false);
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'file.error.invalidJson' });
    });

    it('неизвестная нода: ошибка с названием типа', () => {
        const editor = useEditor();
        const text = JSON.stringify({
            format: 'graph-up',
            version: 1,
            graph: { nodes: { a: { id: 'a', type: 'x/y', x: 0, y: 0, values: {} } }, connections: [], variables: [] },
        });
        editor.importText(text);
        expect(editor.notice).toMatchObject({ key: 'file.error.unknownNode', args: ['x/y'] });
    });

    it('отброшенные связи сообщаются', () => {
        const editor = useEditor();
        const file = JSON.parse(editor.exportText());
        file.graph.connections.push({ id: 'ghost', from: { node: 'nope', pin: 'out' }, to: { node: 'start', pin: 'in' } });

        editor.importText(JSON.stringify(file));
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'file.loadedWithDropped' });
        expect(editor.notice?.args?.[1]).toBe(1);
    });

    it('«Новый» создаёт пустой граф и отменяется', () => {
        const editor = useEditor();
        const nodes = Object.keys(editor.graph.nodes).length;

        editor.newGraph();
        expect(Object.keys(editor.graph.nodes)).toHaveLength(0);
        expect(editor.graph.variables).toHaveLength(0);

        editor.undo();
        expect(Object.keys(editor.graph.nodes)).toHaveLength(nodes);
    });

    it('открытие файла сбрасывает выделение и применяет камеру (с ограничением масштаба)', () => {
        const editor = useEditor();
        editor.setSelection(['start']);

        const file = JSON.parse(editor.exportText());
        file.view = { x: 5, y: 6, z: 50 };
        editor.importText(JSON.stringify(file));

        expect(editor.selection.size).toBe(0);
        expect(editor.camera).toEqual({ x: 5, y: 6, z: 2 }); // MAX_ZOOM
    });
});

describe('автосохранение', () => {
    let storage: ReturnType<typeof memoryStorage>;

    beforeEach(() => {
        storage = memoryStorage();
        vi.stubGlobal('localStorage', storage);
        setActivePinia(createPinia());
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('по умолчанию выключено: правки ничего не пишут', () => {
        const editor = useEditor();
        editor.moveSelected(1, 1);
        editor.setSelection(['start']);
        editor.moveSelected(10, 10);
        editor.commit();
        vi.advanceTimersByTime(5000);
        expect(readSaved()).toBeNull();
    });

    it('после правки пишет с задержкой, серия правок — одна запись', () => {
        const editor = useEditor();
        const stop = editor.startAutosave();

        editor.setSelection(['start']);
        for (let i = 0; i < 5; i++) {
            editor.moveSelected(10, 0);
            editor.commit();
            vi.advanceTimersByTime(100); // быстрее задержки автосохранения
        }
        expect(storage.writes).toBe(0);

        vi.advanceTimersByTime(500);
        expect(storage.writes).toBe(1);
        expect(JSON.parse(readSaved()!).graph.nodes.start.x).toBe(40 + 50);

        stop();
    });

    it('undo тоже сохраняется', () => {
        const editor = useEditor();
        const stop = editor.startAutosave();

        editor.setSelection(['start']);
        editor.moveSelected(100, 0);
        editor.commit();
        vi.advanceTimersByTime(500);
        editor.undo();
        vi.advanceTimersByTime(500);

        expect(JSON.parse(readSaved()!).graph.nodes.start.x).toBe(40);
        stop();
    });

    it('flushSave пишет немедленно (закрытие вкладки)', () => {
        const editor = useEditor();
        const stop = editor.startAutosave();
        editor.openPalette([0, 0], [1, 1]);
        editor.createFromPalette('math/add');

        editor.flushSave();
        expect(readSaved()).not.toBeNull();
        stop();
    });

    it('после stop() запись прекращается', () => {
        const editor = useEditor();
        const stop = editor.startAutosave();
        stop();
        editor.openPalette([0, 0], [1, 1]);
        editor.createFromPalette('math/add');
        vi.advanceTimersByTime(5000);
        expect(readSaved()).toBeNull();
    });

    it('при старте восстанавливает граф и камеру, история начинается заново', () => {
        const first = useEditor();
        const stop = first.startAutosave();
        first.openPalette([0, 0], [321, 654]);
        first.createFromPalette('math/add');
        first.camera = { x: 11, y: 22, z: 1.25 };
        first.flushSave();
        stop();

        setActivePinia(createPinia()); // «перезагрузка страницы»
        const second = useEditor();
        expect(second.restoreSaved()).toBe(true);

        expect(Object.keys(second.graph.nodes)).toHaveLength(Object.keys(first.graph.nodes).length);
        expect(Object.values(second.graph.nodes).some((n) => n.x === 321 && n.y === 654)).toBe(true);
        expect(second.camera).toEqual({ x: 11, y: 22, z: 1.25 });
        expect(second.canUndo).toBe(false); // восстановление — не правка пользователя
    });

    it('нечего восстанавливать — остаётся демо', () => {
        const editor = useEditor();
        expect(editor.restoreSaved()).toBe(false);
        expect(editor.graph.nodes['start']).toBeDefined();
    });

    it('повреждённое автосохранение: показываем демо, копию откладываем, сообщаем', () => {
        storage.setItem(SAVED_KEY, '{"format":"graph-up","version":1,"graph":{"nodes":"хлам"}}');

        const editor = useEditor();
        expect(editor.restoreSaved()).toBe(false);
        expect(editor.graph.nodes['start']).toBeDefined();
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'file.error.restoreFailed' });
        expect(storage.getItem('graph-up.graph.broken')).toContain('хлам');

        // автосохранение не затирает отложенную копию
        const stop = editor.startAutosave();
        editor.flushSave();
        expect(storage.getItem('graph-up.graph.broken')).toContain('хлам');
        stop();
    });

    it('переполненное хранилище: сообщаем один раз и не падаем', () => {
        const editor = useEditor();
        const stop = editor.startAutosave();
        storage.failWrites = true;

        editor.flushSave();
        expect(editor.notice).toMatchObject({ key: 'file.error.saveFailed' });

        editor.notice = null;
        editor.flushSave();
        expect(editor.notice).toBeNull(); // повторно не надоедаем

        stop();
    });

    it('createGraph() пустой граф сериализуется и восстанавливается', () => {
        const editor = useEditor();
        editor.loadGraph(createGraph());
        const text = editor.exportText();
        setActivePinia(createPinia());
        const other = useEditor();
        expect(other.importText(text)).toBeNull();
        expect(Object.keys(other.graph.nodes)).toHaveLength(0);
    });
});
