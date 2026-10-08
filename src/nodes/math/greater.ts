import { data, defineNode } from '@/graph/define';

export default defineNode({
    id: 'math/greater',
    title: 'Greater',
    inputs: { a: data('float', 0), b: data('float', 0) },
    outputs: { result: data('boolean') },
    run: ({ a, b }) => ({ outputs: { result: a > b } }),
});
