import { defineStore } from 'pinia';
import { markRaw, reactive, ref } from 'vue';
import type { ConcreteType } from '@/graph/coerce';
import { coerce } from '@/graph/coerce';
import { addNode, connect, createGraph, disconnect, removeNode } from '@/graph/graph';
import { pinOf } from '@/graph/pins';
import { parse, serialize, type LoadError, type SavedView } from '@/graph/serialize';
import type { Graph, PinRef } from '@/graph/types';
import type { MessageArgs, MessageKey } from '@/i18n';
import * as vars from '@/graph/variables';
import { canConnect } from '@/graph/validate';
import { createDefaultRegistry } from '@/nodes';
import { createCamera, MAX_ZOOM, MIN_ZOOM, screenToWorld, type Camera } from './camera';
import { History } from './history';
import { backupBroken, readSaved, writeSaved } from './persistence';
import { findCompatiblePin } from './palette';

export type PinDir = 'in' | 'out';

/** Короткое сообщение пользователю (результат открытия файла и т.п.). Хранит ключ перевода. */
export interface Notice {
    kind: 'info' | 'error';
    key: MessageKey;
    args?: MessageArgs;
}

const NOTICE_MS = 5000;
const AUTOSAVE_DELAY_MS = 400;

export interface PinTarget {
    ref: PinRef;
    dir: PinDir;
}

/** Связь, которую пользователь сейчас протягивает. */
export interface PendingConnection {
    /** Пин, с которого начали. */
    origin: PinTarget;
    /** Курсор в мировых координатах. */
    cursor: [number, number];
    /** Пин под курсором допустим (true), недопустим (false) или под курсором нет пина (null). */
    valid: boolean | null;
}

/** Открытая палитра нод. */
export interface PaletteState {
    /** Позиция окна относительно холста, px. */
    screen: [number, number];
    /** Куда поставить новую ноду, мировые координаты. */
    world: [number, number];
    /** Если палитра открыта протягиванием связи — пин, от которого тянули. */
    origin: PinTarget | null;
}

type PinOffsets = Record<string, [number, number]>;

function createDemo(registry: ReturnType<typeof createDefaultRegistry>) {
    const g = createGraph();
    const add = (type: string, id: string, x: number, y: number, values: Record<string, unknown> = {}, variable?: string) =>
        addNode(g, registry, type, { id, x, y, values, ...(variable ? { config: { variable } } : {}) });

    add('flow/start', 'start', 40, 120);
    add('math/greater', 'gt', 40, 280, { a: 5, b: 3 });
    add('flow/branch', 'branch', 300, 120);
    add('debug/print', 'yes', 580, 80, { message: 'a > b' });
    add('debug/print', 'no', 580, 240, { message: 'a <= b' });

    connect(g, registry, { node: 'start', pin: 'out' }, { node: 'branch', pin: 'in' });
    connect(g, registry, { node: 'gt', pin: 'result' }, { node: 'branch', pin: 'condition' });
    connect(g, registry, { node: 'branch', pin: 'then' }, { node: 'yes', pin: 'in' });
    connect(g, registry, { node: 'branch', pin: 'else' }, { node: 'no', pin: 'in' });

    // Вторая программа (запускается, если выделить её Start): sum = 1 + 2 + 3 + 4 + 5
    const sum = vars.addVariable(g, { name: 'sum', type: 'float' }).id;
    add('flow/start', 'start2', 40, 460);
    add('vars/set', 'init', 200, 460, { value: 0 }, sum);
    add('flow/for-loop', 'loop', 420, 460, { first: 1, last: 5 });
    add('vars/set', 'accumulate', 880, 460, {}, sum);
    add('vars/get', 'read', 440, 640, {}, sum);
    add('math/add', 'plus', 660, 600);
    add('debug/print', 'result', 880, 720);
    add('vars/get', 'readResult', 640, 800, {}, sum);

    connect(g, registry, { node: 'start2', pin: 'out' }, { node: 'init', pin: 'in' });
    connect(g, registry, { node: 'init', pin: 'out' }, { node: 'loop', pin: 'in' });
    connect(g, registry, { node: 'loop', pin: 'body' }, { node: 'accumulate', pin: 'in' });
    connect(g, registry, { node: 'loop', pin: 'completed' }, { node: 'result', pin: 'in' });
    connect(g, registry, { node: 'read', pin: 'value' }, { node: 'plus', pin: 'a' });
    connect(g, registry, { node: 'loop', pin: 'index' }, { node: 'plus', pin: 'b' });
    connect(g, registry, { node: 'plus', pin: 'result' }, { node: 'accumulate', pin: 'value' });
    connect(g, registry, { node: 'readResult', pin: 'value' }, { node: 'result', pin: 'message' });
    return g;
}

export const useEditor = defineStore('editor', () => {
    const registry = markRaw(createDefaultRegistry());
    const graph = ref(createDemo(registry));
    const camera = ref<Camera>(createCamera());
    const selection = reactive(new Set<string>());
    const selectedConnection = ref<string | null>(null);
    const pending = ref<PendingConnection | null>(null);
    const palette = ref<PaletteState | null>(null);

    /** Позиции пинов относительно левого верхнего угла ноды (в мировых единицах), измеряются по DOM. */
    const pinOffsets = reactive<Record<string, PinOffsets>>({});

    //---]>
    // выделение

    function setSelection(ids: Iterable<string>) {
        const next = new Set(ids);
        for (const id of [...selection]) if (!next.has(id)) selection.delete(id);
        for (const id of next) selection.add(id);
    }

    function toggleSelected(id: string) {
        if (!selection.delete(id)) selection.add(id);
    }

    function selectConnection(id: string | null) {
        selectedConnection.value = id;
    }

    function moveSelected(dx: number, dy: number) {
        for (const id of selection) {
            const node = graph.value.nodes[id];
            if (node) {
                node.x += dx;
                node.y += dy;
            }
        }
    }

    /** Удаляет выделенную связь или выделенные ноды. */
    function removeSelected() {
        if (selectedConnection.value) {
            disconnect(graph.value, selectedConnection.value);
            selectedConnection.value = null;
            return;
        }
        for (const id of selection) removeNode(graph.value, id);
        selection.clear();
    }

    //---]>
    // значения и пины

    function isConnected(nodeId: string, pin: string, direction: PinDir) {
        return graph.value.connections.some((c) =>
            direction === 'in' ? c.to.node === nodeId && c.to.pin === pin : c.from.node === nodeId && c.from.pin === pin,
        );
    }

    function setValue(nodeId: string, pin: string, value: unknown) {
        const node = graph.value.nodes[nodeId];
        if (node) node.values[pin] = value;
    }

    function setPinOffsets(nodeId: string, offsets: PinOffsets) {
        const prev = pinOffsets[nodeId];
        const keys = Object.keys(offsets);
        const same =
            prev !== undefined &&
            keys.length === Object.keys(prev).length &&
            keys.every((k) => prev[k] && Math.abs(prev[k][0] - offsets[k]![0]) < 0.01 && Math.abs(prev[k][1] - offsets[k]![1]) < 0.01);
        if (!same) pinOffsets[nodeId] = offsets;
    }

    function clearPinOffsets(nodeId: string) {
        delete pinOffsets[nodeId];
    }

    /** Мировые координаты центра пина или null, если ещё не измерен. */
    function pinWorld(ref: PinRef, dir: PinDir): [number, number] | null {
        const node = graph.value.nodes[ref.node];
        const offset = pinOffsets[ref.node]?.[`${dir}:${ref.pin}`];
        return node && offset ? [node.x + offset[0], node.y + offset[1]] : null;
    }

    //---]>
    // протягивание связи

    function pairOf(origin: PinTarget, target: PinTarget): [PinRef, PinRef] {
        return origin.dir === 'out' ? [origin.ref, target.ref] : [target.ref, origin.ref];
    }

    function isValidTarget(origin: PinTarget, target: PinTarget): boolean {
        if (origin.dir === target.dir) return false;
        const [from, to] = pairOf(origin, target);
        return canConnect(graph.value, registry, from, to).ok;
    }

    /**
     * Начать связь с пина. Если это занятый data-вход, связь «снимается» с него,
     * и пользователь тянет её дальше от исходного выхода (как в Blueprint).
     */
    function startConnect(pin: PinTarget, cursor: [number, number]) {
        let origin = pin;

        if (pin.dir === 'in') {
            const conn = graph.value.connections.find((c) => c.to.node === pin.ref.node && c.to.pin === pin.ref.pin);
            const def = pinOf(registry, graph.value, pin.ref, 'in');
            if (conn && def?.kind === 'data') {
                disconnect(graph.value, conn.id);
                origin = { ref: conn.from, dir: 'out' };
            }
        }

        pending.value = { origin, cursor, valid: null };
    }

    function updateConnect(cursor: [number, number], target: PinTarget | null) {
        const p = pending.value;
        if (!p) return;
        p.cursor = cursor;
        p.valid = target ? isValidTarget(p.origin, target) : null;
    }

    /** Завершить протягивание. Возвращает true, если связь создана. */
    function finishConnect(target: PinTarget | null): boolean {
        const p = pending.value;
        pending.value = null;
        if (!p || !target || !isValidTarget(p.origin, target)) return false;

        const [from, to] = pairOf(p.origin, target);
        connect(graph.value, registry, from, to);
        return true;
    }

    //---]>
    // переменные

    /** Размер видимой области холста (px): нужен, чтобы ставить новые ноды в центр экрана. Обновляет холст. */
    const viewport = ref({ w: 800, h: 600 });

    function addVariable() {
        return vars.addVariable(graph.value);
    }

    function removeVariable(id: string) {
        vars.removeVariable(graph.value, id);
    }

    function renameVariable(id: string, name: string) {
        const variable = graph.value.variables.find((v) => v.id === id);
        if (variable && name.trim()) variable.name = name.trim();
    }

    /** Меняет тип переменной. Возвращает число связей, которые пришлось удалить. */
    function retypeVariable(id: string, type: ConcreteType): number {
        return vars.setVariableType(graph.value, registry, id, type);
    }

    function setVariableDefault(id: string, value: unknown) {
        const variable = graph.value.variables.find((v) => v.id === id);
        if (!variable) return;
        const converted = coerce(variable.type, value);
        if (converted !== undefined && !(typeof converted === 'number' && Number.isNaN(converted))) variable.default = converted;
    }

    /** Ставит Get/Set для переменной в центр видимой области и выделяет новую ноду. */
    function addVariableNode(kind: 'get' | 'set', variableId: string) {
        const [x, y] = screenToWorld(camera.value, viewport.value.w / 2, viewport.value.h / 2);
        const node = addNode(graph.value, registry, kind === 'get' ? 'vars/get' : 'vars/set', {
            x: Math.round(x),
            y: Math.round(y),
            config: { variable: variableId },
        });
        setSelection([node.id]);
        selectedConnection.value = null;
        return node;
    }

    //---]>
    // уведомления, файлы, автосохранение

    const notice = ref<Notice | null>(null);
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    function showNotice(kind: Notice['kind'], key: MessageKey, args?: MessageArgs) {
        notice.value = { kind, key, args };
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => (notice.value = null), NOTICE_MS);
    }

    let autosaveOn = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let saveFailedShown = false;

    /** Записывает граф и положение камеры в localStorage. */
    function flushSave() {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        if (!autosaveOn) return;

        if (writeSaved(serialize(graph.value, camera.value, false))) {
            saveFailedShown = false;
        } else if (!saveFailedShown) {
            saveFailedShown = true; // сообщаем один раз, а не при каждой правке
            showNotice('error', 'file.error.saveFailed');
        }
    }

    function scheduleSave() {
        if (!autosaveOn) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, AUTOSAVE_DELAY_MS);
    }

    /**
     * Включает автосохранение. Выключено по умолчанию (в тестах и до восстановления граф не пишется).
     * Правки сохраняются с небольшой задержкой, а при скрытии вкладки и закрытии — сразу.
     * Возвращает функцию, которая всё отключает.
     */
    function startAutosave(): () => void {
        autosaveOn = true;
        const onHide = () => {
            if (document.visibilityState === 'hidden') flushSave();
        };
        window.addEventListener('pagehide', flushSave);
        document.addEventListener('visibilitychange', onHide);

        return () => {
            autosaveOn = false;
            clearTimeout(saveTimer);
            window.removeEventListener('pagehide', flushSave);
            document.removeEventListener('visibilitychange', onHide);
        };
    }

    /** Подменяет граф целиком. Без `resetHistory` это обычная правка: её можно отменить. */
    function loadGraph(next: Graph, view?: SavedView, resetHistory = false) {
        graph.value = next;
        selection.clear();
        selectedConnection.value = null;
        pending.value = null;
        palette.value = null;
        if (view) camera.value = { x: view.x, y: view.y, z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.z)) };

        if (resetHistory) {
            history.reset(snapshot());
            syncHistory();
        } else {
            commit();
        }
    }

    /** Текст файла для скачивания. */
    const exportText = () => serialize(graph.value, camera.value);

    function errorNotice(error: LoadError): Notice {
        const detail = error.detail === undefined ? undefined : [error.detail];
        return { kind: 'error', key: `file.error.${error.code}`, args: detail };
    }

    /** Открывает граф из текста файла. При ошибке граф не меняется. Результат показывается уведомлением. */
    function importText(text: string): LoadError | null {
        const result = parse(text, registry);
        if (!result.ok) {
            const n = errorNotice(result.error);
            showNotice(n.kind, n.key, n.args);
            return result.error;
        }

        loadGraph(result.graph, result.view);
        const nodes = Object.keys(result.graph.nodes).length;
        if (result.droppedConnections > 0) showNotice('error', 'file.loadedWithDropped', [nodes, result.droppedConnections]);
        else showNotice('info', 'file.loaded', [nodes]);
        return null;
    }

    function newGraph() {
        loadGraph(createGraph(), { x: 0, y: 0, z: 1 });
        showNotice('info', 'file.newGraph');
    }

    /** При старте приложения: поднимает граф из автосохранения. Возвращает true, если было что поднимать. */
    function restoreSaved(): boolean {
        const text = readSaved();
        if (text === null) return false;

        const result = parse(text, registry);
        if (!result.ok) {
            backupBroken(text);
            showNotice('error', 'file.error.restoreFailed');
            return false;
        }

        loadGraph(result.graph, result.view, true);
        return true;
    }

    //---]>
    // undo/redo

    const snapshot = () => JSON.stringify(graph.value);
    const history = new History(snapshot());
    const canUndo = ref(false);
    const canRedo = ref(false);

    function syncHistory() {
        canUndo.value = history.canUndo;
        canRedo.value = history.canRedo;
        scheduleSave(); // граф изменился (правка, undo или redo) — автосохранение подхватит
    }

    /** Запоминает текущий граф как шаг истории. Одинаковый `key` подряд склеивает правки (набор числа в поле). */
    function commit(key?: string) {
        history.commit(snapshot(), key);
        syncHistory();
    }

    function restore(state: string | null): boolean {
        if (state === null) return false;

        graph.value = JSON.parse(state);
        // Выделение и незавершённые действия не входят в историю, но не должны ссылаться на исчезнувшее.
        for (const id of [...selection]) if (!graph.value.nodes[id]) selection.delete(id);
        if (selectedConnection.value && !graph.value.connections.some((c) => c.id === selectedConnection.value)) {
            selectedConnection.value = null;
        }
        pending.value = null;
        palette.value = null;
        syncHistory();
        return true;
    }

    const undo = () => restore(history.undo());
    const redo = () => restore(history.redo());

    /** Действие, меняющее граф: после него состояние попадает в историю. */
    function recorded<A extends unknown[], R>(fn: (...args: A) => R, key?: (...args: A) => string): (...args: A) => R {
        return (...args) => {
            const result = fn(...args);
            commit(key?.(...args));
            return result;
        };
    }

    //---]>
    // палитра нод

    const pinDefOf = (t: PinTarget) => pinOf(registry, graph.value, t.ref, t.dir)!;

    function openPalette(screen: [number, number], world: [number, number], origin: PinTarget | null = null) {
        palette.value = { screen, world, origin };
    }

    function closePalette() {
        palette.value = null;
    }

    /** Нода типа `type` подходит под origin палитры (если он есть). */
    function fitsPaletteOrigin(type: string): boolean {
        const origin = palette.value?.origin;
        return !origin || findCompatiblePin(pinDefOf(origin), origin.dir, registry.get(type)) !== null;
    }

    /** Создаёт ноду в позиции палитры; если палитру открыли связью, подключает новую ноду к её пину. */
    function createFromPalette(type: string) {
        const p = palette.value;
        if (!p) return;

        const def = registry.get(type);
        // Нода, у которой тянули вход, должна оказаться левее курсора.
        const x = p.origin?.dir === 'in' ? p.world[0] - 180 : p.world[0];
        const node = addNode(graph.value, registry, type, { x, y: p.world[1] });

        if (p.origin) {
            const pin = findCompatiblePin(pinDefOf(p.origin), p.origin.dir, def);
            if (pin) {
                const target = { node: node.id, pin };
                if (p.origin.dir === 'out') connect(graph.value, registry, p.origin.ref, target);
                else connect(graph.value, registry, target, p.origin.ref);
            }
        }

        setSelection([node.id]);
        selectedConnection.value = null;
        palette.value = null;
    }

    return {
        notice,
        showNotice,
        exportText,
        importText,
        newGraph,
        loadGraph,
        restoreSaved,
        startAutosave,
        flushSave,
        viewport,
        addVariable: recorded(addVariable),
        removeVariable: recorded(removeVariable),
        renameVariable: recorded(renameVariable),
        retypeVariable: recorded(retypeVariable),
        setVariableDefault: recorded(setVariableDefault, (id) => `default:${id}`),
        addVariableNode: recorded(addVariableNode),
        palette,
        openPalette,
        closePalette,
        fitsPaletteOrigin,
        createFromPalette: recorded(createFromPalette),
        canUndo,
        canRedo,
        commit,
        undo,
        redo,
        registry,
        graph,
        camera,
        selection,
        selectedConnection,
        pending,
        pinOffsets,
        setSelection,
        toggleSelected,
        selectConnection,
        moveSelected,
        removeSelected: recorded(removeSelected),
        isConnected,
        setValue: recorded(setValue, (nodeId, pin) => `value:${nodeId}:${pin}`),
        setPinOffsets,
        clearPinOffsets,
        pinWorld,
        startConnect,
        updateConnect,
        finishConnect: recorded(finishConnect),
    };
});
