import { data, defineNode } from '@/graph/define';

/** Чистая нода: читает переменную в момент, когда кто-то запросил значение. */
export default defineNode({
    id: 'vars/get',
    title: 'Get Variable',
    inputs: { name: data('string', 'var') },
    outputs: { value: data('any') },
    run: ({ name }, ctx) => {
        if (!ctx.vars.has(name)) throw new Error(`Variable "${name}" is not set`);
        return { outputs: { value: ctx.vars.get(name) } };
    },
});
