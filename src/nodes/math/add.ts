import { data, defineNode } from '@/graph/define';

export default defineNode({
    id: 'math/add',
    title: 'Add',
    inputs: { a: data('float', 0), b: data('float', 0) },
    outputs: { result: data('float') },
    run: ({ a, b }) => ({ outputs: { result: a + b } }),
});
