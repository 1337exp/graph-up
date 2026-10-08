import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditor } from '@/editor/store';

const out = (node: string, pin: string) => ({ ref: { node, pin }, dir: 'out' as const });
const inp = (node: string, pin: string) => ({ ref: { node, pin }, dir: 'in' as const });

describe('editor store: протягивание связей', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('создаёт допустимую связь, недопустимую отклоняет', () => {
        const editor = useEditor();
        const before = editor.graph.connections.length;

        // exec → data: нельзя
        editor.startConnect(out('start', 'out'), [0, 0]);
        expect(editor.finishConnect(inp('gt', 'a'))).toBe(false);

        // из выхода в выход: нельзя
        editor.startConnect(out('gt', 'result'), [0, 0]);
        expect(editor.finishConnect(out('start', 'out'))).toBe(false);

        // boolean → any: можно, из входа в выход тоже (обратное направление)
        editor.startConnect(inp('yes', 'message'), [0, 0]);
        expect(editor.finishConnect(out('gt', 'result'))).toBe(true);
        expect(editor.graph.connections.length).toBe(before + 1);
    });

    it('взятие занятого data-входа снимает связь и тянет её от источника', () => {
        const editor = useEditor();
        const before = editor.graph.connections.length;

        editor.startConnect(inp('branch', 'condition'), [0, 0]);
        expect(editor.graph.connections.length).toBe(before - 1);
        expect(editor.pending?.origin).toEqual(out('gt', 'result'));

        expect(editor.finishConnect(null)).toBe(false);
        expect(editor.pending).toBeNull();
    });

    it('Delete удаляет выбранную связь', () => {
        const editor = useEditor();
        const id = editor.graph.connections[0]!.id;
        const before = editor.graph.connections.length;
        editor.selectConnection(id);
        editor.removeSelected();
        expect(editor.graph.connections.length).toBe(before - 1);
    });
});
