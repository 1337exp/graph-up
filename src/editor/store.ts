import { defineStore } from 'pinia';
import { markRaw, reactive, ref } from 'vue';
import { addNode, connect, createGraph, disconnect, removeNode } from '@/graph/graph';
import type { PinRef } from '@/graph/types';
import { canConnect } from '@/graph/validate';
import { createDefaultRegistry } from '@/nodes';
import { createCamera, type Camera } from './camera';
import { findCompatiblePin } from './palette';

export type PinDir = 'in' | 'out';

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
    const add = (type: string, id: string, x: number, y: number, values: Record<string, unknown> = {}) =>
        addNode(g, registry, type, { id, x, y, values });

    add('flow/start', 'start', 40, 120);
    add('math/greater', 'gt', 40, 280, { a: 5, b: 3 });
    add('flow/branch', 'branch', 300, 120);
    add('debug/print', 'yes', 580, 80, { message: 'a > b' });
    add('debug/print', 'no', 580, 240, { message: 'a <= b' });

    connect(g, registry, { node: 'start', pin: 'out' }, { node: 'branch', pin: 'in' });
    connect(g, registry, { node: 'gt', pin: 'result' }, { node: 'branch', pin: 'condition' });
    connect(g, registry, { node: 'branch', pin: 'then' }, { node: 'yes', pin: 'in' });
    connect(g, registry, { node: 'branch', pin: 'else' }, { node: 'no', pin: 'in' });
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
            const def = registry.get(graph.value.nodes[pin.ref.node]!.type).inputs[pin.ref.pin];
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
    // палитра нод

    const pinDefOf = (t: PinTarget) =>
        registry.get(graph.value.nodes[t.ref.node]!.type)[t.dir === 'out' ? 'outputs' : 'inputs'][t.ref.pin]!;

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
        palette,
        openPalette,
        closePalette,
        fitsPaletteOrigin,
        createFromPalette,
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
        removeSelected,
        isConnected,
        setValue,
        setPinOffsets,
        clearPinOffsets,
        pinWorld,
        startConnect,
        updateConnect,
        finishConnect,
    };
});
