<script lang="ts" setup>
import { computed } from 'vue';
import { pinColor } from '../colors';
import { pinOf } from '@/graph/pins';
import { curvePath } from '../curve';
import { useEditor } from '../store';

const editor = useEditor();

interface Line {
    id: string;
    d: string;
    color: string;
    exec: boolean;
}

const lines = computed<Line[]>(() => {
    const out: Line[] = [];
    for (const c of editor.graph.connections) {
        const a = editor.pinWorld(c.from, 'out');
        const b = editor.pinWorld(c.to, 'in');
        if (!a || !b) continue;

        const pin = pinOf(editor.registry, editor.graph, c.from, 'out');
        if (!pin) continue;
        out.push({ id: c.id, d: curvePath(a[0], a[1], b[0], b[1]), color: pinColor(pin), exec: pin.kind === 'exec' });
    }
    return out;
});

const preview = computed(() => {
    const p = editor.pending;
    if (!p) return null;

    const pos = editor.pinWorld(p.origin.ref, p.origin.dir);
    if (!pos) return null;

    const pin = pinOf(editor.registry, editor.graph, p.origin.ref, p.origin.dir);
    if (!pin) return null;
    const [cx, cy] = p.cursor;
    const d = p.origin.dir === 'out' ? curvePath(pos[0], pos[1], cx, cy) : curvePath(cx, cy, pos[0], pos[1]);
    return { d, color: p.valid === false ? '#ff5252' : pinColor(pin), invalid: p.valid === false };
});
</script>

<template>
    <svg class="connections" width="1" height="1">
        <g
            v-for="line in lines"
            :key="line.id"
            class="conn"
            :class="{ selected: editor.selectedConnection === line.id }"
            :data-conn-id="line.id"
        >
            <path class="glow" :d="line.d" :stroke="line.color" />
            <path class="line" :d="line.d" :stroke="line.color" />
            <path class="hit" :d="line.d" />
        </g>

        <path v-if="preview" class="line preview" :class="{ invalid: preview.invalid }" :d="preview.d" :stroke="preview.color" />
    </svg>
</template>

<style scoped>
.connections {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
}

path {
    fill: none;
    stroke-linecap: round;
    /* толщина в экранных пикселях, не зависит от зума */
    vector-effect: non-scaling-stroke;
}

.line {
    stroke-width: 2.5;
    pointer-events: none;
}

.preview {
    stroke-dasharray: 6 4;
    opacity: 0.9;
}

.glow {
    stroke-width: 9;
    opacity: 0;
    filter: blur(3px);
    pointer-events: none;
}

.hit {
    stroke: transparent;
    stroke-width: 12;
    pointer-events: stroke;
    cursor: pointer;
}

.conn:hover .line,
.conn.selected .line {
    stroke-width: 4;
}

.conn:hover .glow,
.conn.selected .glow {
    opacity: 0.35;
}

.conn.selected .line {
    stroke: #ffca00;
}
</style>
