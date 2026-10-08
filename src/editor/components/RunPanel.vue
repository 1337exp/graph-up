<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue';
import { downloadText, FILE_NAME, MAX_FILE_BYTES } from '../file';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { SLOW_STEP_MS, useRun } from '../run';
import { useEditor } from '../store';

const run = useRun();
const editor = useEditor();
const { t, locale } = useI18n();

function onLocaleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (isLocaleCode(value)) setLocale(value);
}
const logEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // чтобы тот же файл можно было открыть повторно
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) editor.showNotice('error', 'file.error.tooLarge');
    else editor.importText(await file.text());
}

// Прокручиваем лог вниз при новых строках.
watch(
    () => run.lines.length,
    async () => {
        await nextTick();
        logEl.value?.scrollTo({ top: logEl.value.scrollHeight });
    },
);
</script>

<template>
    <div class="toolbar">
        <div class="file">
            <button class="text" :title="t('file.new')" @click="editor.newGraph()">{{ t('file.new') }}</button>
            <button class="text" :title="t('file.open')" @click="fileInput?.click()">{{ t('file.open') }}</button>
            <button class="text" :title="t('file.save')" @click="downloadText(FILE_NAME, editor.exportText())">
                {{ t('file.save') }}
            </button>
            <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
        </div>

        <div class="history">
            <button class="icon" :disabled="!editor.canUndo" :title="t('history.undo')" @click="editor.undo()">↶</button>
            <button class="icon" :disabled="!editor.canRedo" :title="t('history.redo')" @click="editor.redo()">↷</button>
        </div>

        <button v-if="!run.running" class="btn run" @click="run.run()">▶ {{ t('run.run') }}</button>
        <button v-else class="btn stop" @click="run.stop()">■ {{ t('run.stop') }}</button>

        <label class="slow">
            <input v-model="run.slow" type="checkbox" />
            {{ t('run.slow', [SLOW_STEP_MS]) }}
        </label>

        <select class="lang" :value="locale" :aria-label="t('ui.language')" @change="onLocaleChange">
            <option v-for="code in LOCALE_CODES" :key="code" :value="code">{{ LOCALE_NAMES[code] }}</option>
        </select>
    </div>

    <div v-if="editor.notice" class="notice" :class="editor.notice.kind">
        {{ t(editor.notice.key, editor.notice.args) }}
    </div>

    <div class="log-panel">
        <header>
            <span>{{ t('log.title') }}</span>
            <button class="clear" @click="run.clearLog()">{{ t('log.clear') }}</button>
        </header>
        <div ref="logEl" class="lines">
            <div v-if="!run.lines.length" class="empty">{{ t('log.empty') }}</div>
            <div v-for="(line, i) in run.lines" :key="i" class="line" :class="`kind-${line.kind}`">
                {{ line.kind === 'log' ? line.text : t(line.key, line.args) }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.92);
    color: #d6d9de;
    font-size: 12px;
}

.btn {
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.btn.run { background: #2e7d32; }
.btn.stop { background: #c62828; }

.file {
    display: flex;
    gap: 4px;
}

.text {
    padding: 2px 8px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #2c3850;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.notice {
    position: absolute;
    top: 58px;
    left: 12px;
    max-width: 420px;
    padding: 5px 10px;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.95);
    color: #d6d9de;
    font-size: 12px;
}

.notice.error {
    border-color: #7a2e2e;
    color: #ff9b9b;
}

.history {
    display: flex;
    gap: 4px;
}

.icon {
    width: 26px;
    padding: 2px 0;
    border: 1px solid #333;
    border-radius: 4px;
    background: #2c3850;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.icon:disabled {
    opacity: 0.35;
    cursor: default;
}

.lang {
    padding: 2px 4px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #101214;
    color: inherit;
    font: inherit;
}

.slow {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}

.log-panel {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    height: 150px;
    display: flex;
    flex-direction: column;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(16, 18, 20, 0.94);
    color: #d6d9de;
    font: 12px/1.5 ui-monospace, Consolas, monospace;
}

.log-panel header {
    display: flex;
    justify-content: space-between;
    padding: 3px 10px;
    border-bottom: 1px solid #2a2d33;
    color: #8b929c;
}

.clear {
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.lines {
    flex: 1;
    overflow-y: auto;
    padding: 4px 10px;
}

.empty { color: #5c626b; }
.line.kind-info { color: #8b929c; }
.line.kind-error { color: #ff6b6b; }
</style>
