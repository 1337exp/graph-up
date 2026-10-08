import type { Registry } from './registry';
import type { Graph, NodeInstance, PinDef, PinDefs, PinRef } from './types';

export interface ResolvedPins {
    inputs: PinDefs;
    outputs: PinDefs;
    /** Уточнение к названию ноды, например имя переменной. */
    subtitle?: string;
}

/**
 * Пины конкретной ноды: статические из определения, поверх которых лежат пины,
 * вычисленные по экземпляру (`NodeDef.resolve`), например тип переменной.
 * Всё, что работает с пинами (валидация, исполнение, отрисовка), берёт их отсюда, а не из `def.inputs`.
 */
export function resolvePins(registry: Registry, graph: Graph, node: NodeInstance): ResolvedPins {
    const def = registry.get(node.type);
    const dynamic = def.resolve?.(node, graph);

    return {
        inputs: dynamic?.inputs ? { ...def.inputs, ...dynamic.inputs } : def.inputs,
        outputs: dynamic?.outputs ? { ...def.outputs, ...dynamic.outputs } : def.outputs,
        subtitle: dynamic?.subtitle,
    };
}

/** Описание пина по ссылке. `dir`: `out` — выход, `in` — вход. */
export function pinOf(registry: Registry, graph: Graph, ref: PinRef, dir: 'in' | 'out'): PinDef | undefined {
    const node = graph.nodes[ref.node];
    if (!node) return undefined;

    const pins = resolvePins(registry, graph, node);
    return (dir === 'out' ? pins.outputs : pins.inputs)[ref.pin];
}
