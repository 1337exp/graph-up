<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { SLOW_STEP_MS, useRun } from '../run';

const run = useRun();
const { t, locale } = useI18n();

function onLocaleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (isLocaleCode(value)) setLocale(value);
}
const logEl = ref<HTMLElement | null>(null);

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

    <div class="log">
        <header>
            <span>{{ t('log.title') }}</span>
            <button class="clear" @click="run.clearLog()">{{ t('log.clear') }}</button>
        </header>
        <div ref="logEl" class="lines">
            <div v-if="!run.lines.length" class="empty">{{ t('log.empty') }}</div>
            <div v-for="(line, i) in run.lines" :key="i" class="line" :class="line.kind">
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

.log {
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

.log header {
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
.line.info { color: #8b929c; }
.line.error { color: #ff6b6b; }
</style>
