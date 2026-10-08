import { data, defineNode, exec } from '@/graph/define';

/** Для i от `first` до `last` включительно: выполняет цепочку из `Loop Body`, затем идёт в `Completed`. */
export default defineNode({
    id: 'flow/for-loop',
    title: 'For Loop',
    inputs: { in: exec(), first: data('int', 0), last: data('int', 10) },
    outputs: { body: exec('Loop Body'), index: data('int'), completed: exec('Completed') },
    run: async ({ first, last }, ctx) => {
        for (let i = first; i <= last; i++) {
            ctx.setOutputs({ index: i });
            await ctx.exec('body');
        }
        return { next: 'completed' };
    },
});
