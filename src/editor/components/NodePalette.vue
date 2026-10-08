<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { categoryTitle, filterNodes, groupByCategory } from '../palette';
import { useEditor } from '../store';

const editor = useEditor();

const WIDTH = 280;
const HEIGHT = 340;

const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const flat = computed(() =>
    filterNodes(editor.registry.all(), query.value).filter((def) => editor.fitsPaletteOrigin(def.id)),
);
const groups = computed(() => groupByCategory(flat.value));

const position = computed(() => {
    const p = editor.palette;
    if (!p) return {};
    // Не даём окну уехать за край экрана.
    const left = Math.max(8, Math.min(p.screen[0], window.innerWidth - WIDTH - 8));
    const top = Math.max(8, Math.min(p.screen[1], window.innerHeight - HEIGHT - 8));
    return { left: `${left}px`, top: `${top}px`, width: `${WIDTH}px`, maxHeight: `${HEIGHT}px` };
});

// Каждое открытие начинается с чистого поиска.
watch(
    () => editor.palette,
    async (now) => {
        if (!now) return;
        query.value = '';
        active.value = 0;
        await nextTick();
        input.value?.focus();
    },
);
watch(query, () => (active.value = 0));

async function scrollToActive() {
    await nextTick();
    listEl.value?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
}

function onKeyDown(e: KeyboardEvent) {
    const n = flat.value.length;

    if (e.key === 'Escape') {
        editor.closePalette();
    } else if (e.key === 'ArrowDown' && n) {
        active.value = (active.value + 1) % n;
        scrollToActive();
    } else if (e.key === 'ArrowUp' && n) {
        active.value = (active.value - 1 + n) % n;
        scrollToActive();
    } else if (e.key === 'Enter') {
        const def = flat.value[active.value];
        if (def) editor.createFromPalette(def.id);
    } else {
        return;
    }
    e.preventDefault();
}

onMounted(() => input.value?.focus());
</script>

<template>
    <div
        v-if="editor.palette"
        class="palette"
        :style="position"
        @pointerdown.stop
        @wheel.stop
        @contextmenu.prevent.stop
        @keydown="onKeyDown"
    >
        <div class="head">
            {{ editor.palette.origin ? 'Совместимые ноды' : 'Добавить ноду' }}
        </div>
        <input ref="input" v-model="query" class="search" placeholder="Поиск…" spellcheck="false" />

        <div ref="listEl" class="list">
            <div v-if="!flat.length" class="empty">Ничего не найдено</div>

            <template v-for="group in groups" :key="group.category">
                <div class="category">{{ categoryTitle(group.category) }}</div>
                <button
                    v-for="def in group.nodes"
                    :key="def.id"
                    class="item"
                    :class="{ active: flat[active]?.id === def.id }"
                    @mousemove="active = flat.indexOf(def)"
                    @click="editor.createFromPalette(def.id)"
                >
                    {{ def.title }}
                </button>
            </template>
        </div>
    </div>
</template>

<style scoped>
.palette {
    position: absolute;
    display: flex;
    flex-direction: column;
    border: 1px solid #3a3f47;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.98);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    color: #d6d9de;
    font-size: 12px;
}

.head {
    padding: 6px 10px 2px;
    color: #8b929c;
}

.search {
    margin: 4px 8px 6px;
    padding: 5px 8px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #101214;
    color: inherit;
    font: inherit;
    outline: none;
}

.search:focus {
    border-color: #4fc3f7;
}

.list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 6px;
}

.category {
    padding: 6px 10px 2px;
    color: #6c737d;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.item {
    display: block;
    width: 100%;
    padding: 4px 16px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.item.active {
    background: #2c3850;
}

.empty {
    padding: 8px 10px;
    color: #5c626b;
}
</style>
