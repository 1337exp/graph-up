<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { panBy, screenToWorld, zoomAt } from '../camera';
import { useEditor, type PinTarget } from '../store';
import ConnectionsLayer from './ConnectionsLayer.vue';
import NodeView from './NodeView.vue';

const editor = useEditor();
const root = ref<HTMLElement | null>(null);

const GRID = 24;
const ZOOM_SPEED = 0.0015;

type Mode = 'idle' | 'pan' | 'drag' | 'marquee' | 'connect';
let mode: Mode = 'idle';
let lastX = 0;
let lastY = 0;
let baseSelection: string[] = [];
let panDistance = 0;

const PAN_CLICK_THRESHOLD = 4; // ПКМ, сдвинутая меньше, — это клик (открывает палитру)

/** Рамка выделения в клиентских координатах. */
const marquee = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

//--------------------------------------------------

const world = computed(() => {
    const { x, y, z } = editor.camera;
    return { transform: `translate(${x}px, ${y}px) scale(${z})` };
});

const gridStyle = computed(() => {
    const { x, y, z } = editor.camera;
    const small = GRID * z;
    const big = small * 5;
    return {
        backgroundSize: `${small}px ${small}px, ${small}px ${small}px, ${big}px ${big}px, ${big}px ${big}px`,
        backgroundPosition: `${x}px ${y}px`,
    };
});

const marqueeStyle = computed(() => {
    const m = marquee.value;
    const rect = root.value?.getBoundingClientRect();
    if (!m || !rect) return {};
    return {
        left: `${Math.min(m.x0, m.x1) - rect.left}px`,
        top: `${Math.min(m.y0, m.y1) - rect.top}px`,
        width: `${Math.abs(m.x1 - m.x0)}px`,
        height: `${Math.abs(m.y1 - m.y0)}px`,
    };
});

//--------------------------------------------------

const nodeIdAt = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ?? null;

const connIdAt = (target: EventTarget | null) =>
    (target as Element | null)?.closest<HTMLElement>('[data-conn-id]')?.dataset.connId ?? null;

function pinAt(target: EventTarget | null): PinTarget | null {
    const pin = (target as Element | null)?.closest<HTMLElement>('[data-pin]');
    const nodeId = pin?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
    if (!pin || !nodeId) return null;
    return { ref: { node: nodeId, pin: pin.dataset.pin! }, dir: pin.dataset.dir as 'in' | 'out' };
}

function openPaletteAt(e: PointerEvent, origin: PinTarget | null) {
    const rect = root.value!.getBoundingClientRect();
    editor.openPalette([e.clientX - rect.left, e.clientY - rect.top], cursorWorld(e), origin);
}

function cursorWorld(e: PointerEvent): [number, number] {
    const rect = root.value!.getBoundingClientRect();
    return screenToWorld(editor.camera, e.clientX - rect.left, e.clientY - rect.top);
}

function nodesInMarquee(): string[] {
    const m = marquee.value;
    if (!m || !root.value) return [];

    const left = Math.min(m.x0, m.x1);
    const right = Math.max(m.x0, m.x1);
    const top = Math.min(m.y0, m.y1);
    const bottom = Math.max(m.y0, m.y1);

    const ids: string[] = [];
    for (const el of root.value.querySelectorAll<HTMLElement>('[data-node-id]')) {
        const r = el.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) ids.push(el.dataset.nodeId!);
    }
    return ids;
}

//--------------------------------------------------

function onPointerDown(e: PointerEvent) {
    const el = root.value;
    if (!el || (e.target as HTMLElement).tagName === 'INPUT') return;

    el.focus();
    editor.closePalette();
    lastX = e.clientX;
    lastY = e.clientY;
    panDistance = 0;

    if (e.button === 1 || e.button === 2) {
        mode = 'pan';
    } else if (e.button === 0) {
        const connId = connIdAt(e.target);
        if (connId) {
            editor.setSelection([]);
            editor.selectConnection(connId);
            el.focus();
            e.preventDefault();
            return;
        }
        editor.selectConnection(null);

        const pin = pinAt(e.target);
        const id = nodeIdAt(e.target);
        const additive = e.ctrlKey || e.shiftKey;

        if (pin) {
            editor.startConnect(pin, cursorWorld(e));
            mode = 'connect';
        } else if (id) {
            if (additive) {
                editor.toggleSelected(id);
                if (!editor.selection.has(id)) return;
            } else if (!editor.selection.has(id)) {
                editor.setSelection([id]);
            }
            mode = 'drag';
        } else {
            baseSelection = additive ? [...editor.selection] : [];
            editor.setSelection(baseSelection);
            marquee.value = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
            mode = 'marquee';
        }
    } else {
        return;
    }

    e.preventDefault();
    el.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (mode === 'pan') {
        panDistance += Math.hypot(dx, dy);
        editor.camera = panBy(editor.camera, dx, dy);
    } else if (mode === 'drag') {
        editor.moveSelected(dx / editor.camera.z, dy / editor.camera.z);
    } else if (mode === 'connect') {
        editor.updateConnect(cursorWorld(e), pinAt(document.elementFromPoint(e.clientX, e.clientY)));
    } else if (mode === 'marquee' && marquee.value) {
        marquee.value = { ...marquee.value, x1: e.clientX, y1: e.clientY };
        editor.setSelection([...baseSelection, ...nodesInMarquee()]);
    }
}

function onPointerUp(e: PointerEvent) {
    if (mode === 'idle') return;
    if (mode === 'connect') {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const origin = editor.pending?.origin ?? null;
        const connected = editor.finishConnect(pinAt(under));

        // Отпустили связь над пустым холстом — предлагаем создать ноду, подходящую к пину.
        if (!connected && origin && under && root.value?.contains(under) && !under.closest('[data-node-id]')) {
            openPaletteAt(e, origin);
        }
    } else if (mode === 'pan' && e.button === 2 && panDistance < PAN_CLICK_THRESHOLD) {
        openPaletteAt(e, null);
    }
    mode = 'idle';
    marquee.value = null;
    root.value?.releasePointerCapture(e.pointerId);
}

// Размер холста нужен стору, чтобы ставить новые ноды в центр экрана.
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    const el = root.value!;
    const update = () => (editor.viewport = { w: el.clientWidth, h: el.clientHeight });
    update();
    resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
});
onUnmounted(() => resizeObserver?.disconnect());

// После закрытия палитры возвращаем фокус на холст, чтобы работали горячие клавиши.
watch(
    () => editor.palette,
    (now, before) => {
        if (!now && before) root.value?.focus();
    },
);

function onWheel(e: WheelEvent) {
    const rect = root.value!.getBoundingClientRect();
    editor.camera = zoomAt(editor.camera, e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * ZOOM_SPEED));
}

function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') editor.removeSelected();
}
</script>

<template>
    <div
        ref="root"
        class="canvas"
        tabindex="0"
        :style="gridStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
        @keydown="onKeyDown"
    >
        <div class="world" :style="world">
            <ConnectionsLayer />
            <NodeView
                v-for="node in editor.graph.nodes"
                :key="node.id"
                :node="node"
                :selected="editor.selection.has(node.id)"
            />
        </div>

        <div v-if="marquee" class="marquee" :style="marqueeStyle" />
    </div>
</template>

<style scoped>
.canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
    background-color: #1b1d21;
    background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(to right, rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    touch-action: none;
}

.world {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    transform-origin: 0 0;
}

.marquee {
    position: absolute;
    border: 1px solid #4fc3f7;
    background: rgba(79, 195, 247, 0.12);
    pointer-events: none;
}
</style>
