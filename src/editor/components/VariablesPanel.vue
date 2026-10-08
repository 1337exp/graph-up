<script lang="ts" setup>
import { ref } from 'vue';
import { CONCRETE_TYPES, type ConcreteType } from '@/graph/coerce';
import { useI18n } from '@/i18n';
import { pinColor } from '../colors';
import { useEditor } from '../store';

const editor = useEditor();
const { t } = useI18n();

/** Сколько связей удалила последняя смена типа (подсказка на несколько секунд). */
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function onType(id: string, e: Event) {
    const removed = editor.retypeVariable(id, (e.target as HTMLSelectElement).value as ConcreteType);
    if (!removed) return;

    notice.value = t('variables.removedLinks', [removed]);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice.value = ''), 4000);
}

function onDefault(id: string, type: ConcreteType, e: Event) {
    const el = e.target as HTMLInputElement;
    editor.setVariableDefault(id, type === 'boolean' ? el.checked : el.value);
}
</script>

<template>
    <aside class="variables">
        <header>
            <span>{{ t('variables.title') }}</span>
            <button class="add" @click="editor.addVariable()">+ {{ t('variables.add') }}</button>
        </header>

        <div class="list">
            <div v-if="!editor.graph.variables.length" class="empty">{{ t('variables.empty') }}</div>

            <div v-for="v in editor.graph.variables" :key="v.id" class="row">
                <div class="line">
                    <span class="dot" :style="{ background: pinColor({ kind: 'data', type: v.type }) }" />
                    <input
                        class="name"
                        :value="v.name"
                        spellcheck="false"
                        @change="editor.renameVariable(v.id, ($event.target as HTMLInputElement).value)"
                    />
                    <select :value="v.type" @change="onType(v.id, $event)">
                        <option v-for="type in CONCRETE_TYPES" :key="type" :value="type">{{ t(`types.${type}`) }}</option>
                    </select>
                    <button class="remove" :title="t('variables.remove')" @click="editor.removeVariable(v.id)">×</button>
                </div>

                <div class="line">
                    <input
                        v-if="v.type === 'boolean'"
                        type="checkbox"
                        :checked="Boolean(v.default)"
                        @change="onDefault(v.id, v.type, $event)"
                    />
                    <input
                        v-else
                        class="default"
                        :type="v.type === 'string' ? 'text' : 'number'"
                        :step="v.type === 'int' ? 1 : 'any'"
                        :value="v.default as string | number"
                        @change="onDefault(v.id, v.type, $event)"
                    />
                    <span class="spacer" />
                    <button class="node-btn" @click="editor.addVariableNode('get', v.id)">{{ t('variables.get') }}</button>
                    <button class="node-btn" @click="editor.addVariableNode('set', v.id)">{{ t('variables.set') }}</button>
                </div>
            </div>
        </div>

        <div v-if="notice" class="notice">{{ notice }}</div>
    </aside>
</template>

<style scoped>
.variables {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 260px;
    max-height: 60%;
    display: flex;
    flex-direction: column;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.94);
    color: #d6d9de;
    font-size: 12px;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid #2a2d33;
    font-weight: 600;
}

button {
    border: 1px solid #333;
    border-radius: 4px;
    background: #2c3850;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.add {
    padding: 2px 8px;
}

.list {
    overflow-y: auto;
    padding: 4px 0;
}

.empty,
.notice {
    padding: 6px 10px;
    color: #8b929c;
}

.notice {
    border-top: 1px solid #2a2d33;
    color: #ffca00;
}

.row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px;
}

.row + .row {
    border-top: 1px solid #23262b;
}

.line {
    display: flex;
    align-items: center;
    gap: 6px;
}

.dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.name {
    flex: 1;
    min-width: 0;
}

input,
select {
    padding: 2px 4px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #101214;
    color: inherit;
    font: inherit;
}

.default {
    width: 80px;
}

.spacer {
    flex: 1;
}

.remove {
    padding: 0 6px;
    background: none;
}

.node-btn {
    padding: 2px 8px;
}
</style>
