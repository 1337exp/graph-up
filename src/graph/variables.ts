import { coerce, CONCRETE_TYPES, DEFAULT_BY_TYPE, type ConcreteType } from './coerce';
import { uid } from './ids';
import type { Registry } from './registry';
import type { Graph, NodeInstance, Variable } from './types';
import { pruneInvalidConnections } from './validate';

export { CONCRETE_TYPES };

function uniqueName(graph: Graph, base: string): string {
    const taken = new Set(graph.variables.map((v) => v.name));
    if (!taken.has(base)) return base;

    let n = 2;
    while (taken.has(`${base}${n}`)) n++;
    return `${base}${n}`;
}

export function addVariable(graph: Graph, init: Partial<Omit<Variable, 'id'>> = {}): Variable {
    const type = init.type ?? 'float';
    const variable: Variable = {
        id: uid('v', (id) => graph.variables.some((v) => v.id === id)),
        name: uniqueName(graph, init.name ?? 'var'),
        type,
        default: init.default ?? DEFAULT_BY_TYPE[type],
    };
    graph.variables.push(variable);
    return variable;
}

/** Удаляет переменную. Ноды Get/Set остаются (данные не теряем), но при запуске дадут ошибку. */
export function removeVariable(graph: Graph, id: string): void {
    graph.variables = graph.variables.filter((v) => v.id !== id);
}

/** Переменная, на которую ссылается нода Get/Set (`config.variable`). */
export function variableOf(graph: Graph, node: NodeInstance): Variable | undefined {
    const id = node.config?.variable;
    return typeof id === 'string' ? graph.variables.find((v) => v.id === id) : undefined;
}

/**
 * Меняет тип переменной: значение по умолчанию приводится к новому типу, а связи,
 * ставшие недопустимыми (например, float → int), удаляются. Возвращает число удалённых связей.
 */
export function setVariableType(graph: Graph, registry: Registry, id: string, type: ConcreteType): number {
    const variable = graph.variables.find((v) => v.id === id);
    if (!variable || variable.type === type) return 0;

    // Нетронутое значение по умолчанию становится стандартным для нового типа (0 → ''), введённое пользователем приводится.
    const untouched = variable.default === DEFAULT_BY_TYPE[variable.type];
    variable.type = type;
    const converted = coerce(type, variable.default);
    const unusable = converted === undefined || (typeof converted === 'number' && Number.isNaN(converted));
    variable.default = untouched || unusable ? DEFAULT_BY_TYPE[type] : converted;

    return pruneInvalidConnections(graph, registry);
}
