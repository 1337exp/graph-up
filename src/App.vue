<script lang="ts" setup>
import EditorCanvas from '@/editor/components/EditorCanvas.vue';
import RunPanel from '@/editor/components/RunPanel.vue';
</script>

<template>
    <div class="app">
        <EditorCanvas />
        <RunPanel />
    </div>
</template>

<style scoped>
.app {
    position: relative;
    width: 100%;
    height: 100%;
}
</style>
