<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue';
import { SLOW_STEP_MS, useRun } from '../run';

const run = useRun();
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
        <button v-if="!run.running" class="btn run" @click="run.run()">▶ Run</button>
        <button v-else class="btn stop" @click="run.stop()">■ Stop</button>

        <label class="slow">
            <input v-model="run.slow" type="checkbox" />
            Медленно ({{ SLOW_STEP_MS }} мс/шаг)
        </label>
    </div>

    <div class="log">
        <header>
            <span>Лог</span>
            <button class="clear" @click="run.clearLog()">Очистить</button>
        </header>
        <div ref="logEl" class="lines">
            <div v-if="!run.lines.length" class="empty">Нажми Run — результаты появятся здесь</div>
            <div v-for="(line, i) in run.lines" :key="i" class="line" :class="line.kind">{{ line.text }}</div>
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
