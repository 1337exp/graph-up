import { data, defineNode } from '@/graph/define';
import { variableOf } from '@/graph/variables';

/**
 * Читает переменную. Чистая нода: значение берётся в момент, когда кто-то его запросил.
 * Тип выхода `value` равен типу переменной (пины вычисляются по экземпляру, см. `resolve`).
 */
export default defineNode({
    id: 'vars/get',
    title: 'Get',
    hidden: true, // создаётся из панели переменных
    inputs: {},
    outputs: { value: data('any') },
    resolve: (node, graph) => {
        const variable = variableOf(graph, node);
        return variable ? { subtitle: variable.name, outputs: { value: data(variable.type) } } : {};
    },
    run: (_inputs, ctx) => {
        const id = ctx.config.variable as string;
        if (!ctx.vars.has(id)) throw new Error('Variable is missing (deleted?)');
        return { outputs: { value: ctx.vars.get(id) } };
    },
});
