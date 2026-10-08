import { data, defineNode, exec } from '@/graph/define';

export default defineNode({
    id: 'debug/print',
    title: 'Print',
    inputs: { in: exec(), message: data('any', '') },
    outputs: { out: exec() },
    run: ({ message }, ctx) => {
        ctx.log(String(message));
        return {};
    },
});
