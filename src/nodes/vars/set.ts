import { data, defineNode, exec } from '@/graph/define';

export default defineNode({
    id: 'vars/set',
    title: 'Set Variable',
    inputs: { in: exec(), name: data('string', 'var'), value: data('any') },
    outputs: { out: exec() },
    run: ({ name, value }, ctx) => {
        ctx.vars.set(name, value);
        return {};
    },
});
