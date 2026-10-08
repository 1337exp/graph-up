import { data, defineNode } from '@/graph/define';

export default defineNode({
    id: 'math/add',
    title: 'Add',
    inputs: { a: data('number', 0), b: data('number', 0) },
    outputs: { result: data('number') },
    run: ({ a, b }) => ({ outputs: { result: a + b } }),
});
