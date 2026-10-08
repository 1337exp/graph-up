import { data, defineNode, exec } from '@/graph/define';

export default defineNode({
    id: 'flow/branch',
    title: 'Branch',
    inputs: { in: exec(), condition: data('boolean', false) },
    outputs: { then: exec('True'), else: exec('False') },
    run: ({ condition }) => ({ next: condition ? 'then' : 'else' }),
});
