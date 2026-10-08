<script lang="ts" setup>
import EditorCanvas from '@/editor/components/EditorCanvas.vue';
import NodePalette from '@/editor/components/NodePalette.vue';
import VariablesPanel from '@/editor/components/VariablesPanel.vue';
import RunPanel from '@/editor/components/RunPanel.vue';
</script>

<template>
    <div class="app">
        <EditorCanvas />
        <RunPanel />
        <VariablesPanel />
        <NodePalette />
    </div>
</template>

<style scoped>
.app {
    position: relative;
    width: 100%;
    height: 100%;
}
</style>
