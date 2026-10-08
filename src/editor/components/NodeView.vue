<script lang="ts" setup>
import { computed, onMounted, onUnmounted, onUpdated, ref } from 'vue';
import type { DataPinDef, NodeInstance, PinDef } from '@/graph/types';
import { pinColor } from '../colors';
import { useRun } from '../run';
import { useEditor } from '../store';

const props = defineProps<{ node: NodeInstance; selected: boolean }>();

const editor = useEditor();
const run = useRun();
const def = computed(() => editor.registry.get(props.node.type));

const inputs = computed(() => Object.entries(def.value.inputs));
const outputs = computed(() => Object.entries(def.value.outputs));

const label = (name: string, pin: PinDef) => pin.label ?? name;

//--------------------------------------------------
// Позиции пинов нужны слою связей: меряем по DOM и храним в мировых единицах.

const el = ref<HTMLElement | null>(null);

function measure() {
    const root = el.value;
    if (!root) return;

    const z = editor.camera.z;
    const nodeRect = root.getBoundingClientRect();
    const offsets: Record<string, [number, number]> = {};

    for (const pin of root.querySelectorAll<HTMLElement>('[data-pin]')) {
        const r = pin.getBoundingClientRect();
        offsets[`${pin.dataset.dir}:${pin.dataset.pin}`] = [
            (r.left + r.width / 2 - nodeRect.left) / z,
            (r.top + r.height / 2 - nodeRect.top) / z,
        ];
    }
    editor.setPinOffsets(props.node.id, offsets);
}

let observer: ResizeObserver | null = null;

onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(el.value!);
});
onUpdated(measure); // поле значения исчезает/появляется при (от)соединении
onUnmounted(() => {
    observer?.disconnect();
    editor.clearPinOffsets(props.node.id);
});

function valueOf(name: string, pin: DataPinDef) {
    return name in props.node.values ? props.node.values[name] : pin.default;
}

function onInput(name: string, pin: DataPinDef, e: Event) {
    const el = e.target as HTMLInputElement;
    if (pin.type === 'boolean') editor.setValue(props.node.id, name, el.checked);
    else if (pin.type === 'number') editor.setValue(props.node.id, name, el.value === '' ? 0 : Number(el.value));
    else editor.setValue(props.node.id, name, el.value);
}
</script>

<template>
    <div
        ref="el"
        class="node"
        :class="{ selected, running: run.activeNode === node.id, failed: run.errorNode === node.id }"
        :data-node-id="node.id"
        :style="{ transform: `translate(${node.x}px, ${node.y}px)` }"
    >
        <header class="title">{{ def.title }}</header>

        <div class="body">
            <div class="column inputs">
                <div v-for="[name, pin] in inputs" :key="name" class="pin-row">
                    <span class="pin" :class="pin.kind" :style="{ '--pin-color': pinColor(pin) }" data-dir="in" :data-pin="name" />
                    <span class="pin-label">{{ label(name, pin) }}</span>

                    <template v-if="pin.kind === 'data' && !editor.isConnected(node.id, name, 'in')">
                        <input
                            v-if="pin.type === 'boolean'"
                            type="checkbox"
                            :checked="Boolean(valueOf(name, pin))"
                            @input="onInput(name, pin, $event)"
                        />
                        <input
                            v-else
                            class="field"
                            :type="pin.type === 'number' ? 'number' : 'text'"
                            :value="valueOf(name, pin) as string | number | undefined"
                            @input="onInput(name, pin, $event)"
                        />
                    </template>
                </div>
            </div>

            <div class="column outputs">
                <div v-for="[name, pin] in outputs" :key="name" class="pin-row out">
                    <span class="pin-label">{{ label(name, pin) }}</span>
                    <span class="pin" :class="pin.kind" :style="{ '--pin-color': pinColor(pin) }" data-dir="out" :data-pin="name" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.node {
    position: absolute;
    top: 0;
    left: 0;
    min-width: 140px;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.96);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    font-size: 12px;
    color: #d6d9de;
    cursor: move;
    user-select: none;
}

.node.selected {
    border-color: #ffca00;
    box-shadow: 0 0 0 1px #ffca00, 0 4px 12px rgba(0, 0, 0, 0.5);
}

.node.running {
    border-color: #66bb6a;
    box-shadow: 0 0 0 2px #66bb6a, 0 0 16px rgba(102, 187, 106, 0.6);
}

.node.failed {
    border-color: #ff5252;
    box-shadow: 0 0 0 2px #ff5252, 0 0 16px rgba(255, 82, 82, 0.6);
}

.title {
    padding: 4px 10px;
    border-radius: 5px 5px 0 0;
    background: linear-gradient(#3a4a63, #2c3850);
    font-weight: 600;
}

.body {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 6px 0;
}

.column {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.pin-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
}

.inputs .pin-row {
    padding-right: 10px;
    margin-left: -6px;
}

.outputs .pin-row {
    padding-left: 10px;
    margin-right: -6px;
}

.pin {
    flex: none;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 2px solid var(--pin-color, #888);
    border-radius: 50%;
    background: #15171a;
    cursor: crosshair;
}

/* exec — «стрелка» вправо */
.pin.exec {
    border-radius: 2px;
    clip-path: polygon(0 0, 65% 0, 100% 50%, 65% 100%, 0 100%);
}


.field {
    width: 56px;
    padding: 1px 4px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #101214;
    color: inherit;
    font: inherit;
}
</style>
