import { data, defineNode, exec } from '@/graph/define';
import { variableOf } from '@/graph/variables';

/** Записывает значение в переменную. Тип входа `value` равен типу переменной. */
export default defineNode({
    id: 'vars/set',
    title: 'Set',
    hidden: true, // создаётся из панели переменных
    inputs: { in: exec(), value: data('any') },
    outputs: { out: exec() },
    resolve: (node, graph) => {
        const variable = variableOf(graph, node);
        return variable ? { subtitle: variable.name, inputs: { value: data(variable.type, variable.default as never) } } : {};
    },
    run: ({ value }, ctx) => {
        const id = ctx.config.variable as string;
        if (!ctx.vars.has(id)) throw new Error('Variable is missing (deleted?)');
        ctx.vars.set(id, value);
        return {};
    },
});
