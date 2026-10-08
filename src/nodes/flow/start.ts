import { defineNode, exec } from '@/graph/define';

/** Точка входа: с неё начинается выполнение. */
export default defineNode({
    id: 'flow/start',
    title: 'Start',
    inputs: {},
    outputs: { out: exec() },
    run: () => ({}),
});
