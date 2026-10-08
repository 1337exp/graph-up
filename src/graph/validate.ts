import { pinOf } from './pins';
import type { Registry } from './registry';
import type { Graph, PinDef, PinRef } from './types';

export type CheckResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CheckResult => ({ ok: false, reason });

/**
 * Можно ли вести связь из выхода типа `out` во вход типа `inp`.
 * `any` совместим со всем; `int → float` разрешён (расширение без потерь), обратно нельзя:
 * дробную часть молча терять не стоит, для этого нужна явная конвертация.
 */
export function typesCompatible(out: PinDef, inp: PinDef): boolean {
    if (out.kind === 'exec' || inp.kind === 'exec') return out.kind === inp.kind;
    if (out.type === 'any' || inp.type === 'any' || out.type === inp.type) return true;
    return out.type === 'int' && inp.type === 'float';
}

/** Достижим ли узел `target` из `start`, если идти только по data-связям вперёд. */
function reachesByData(graph: Graph, registry: Registry, start: string, target: string): boolean {
    const seen = new Set<string>();
    const stack = [start];

    while (stack.length) {
        const id = stack.pop()!;
        if (id === target) return true;
        if (seen.has(id)) continue;
        seen.add(id);

        for (const c of graph.connections) {
            if (c.from.node === id && pinOf(registry, graph, c.from, 'out')?.kind === 'data') stack.push(c.to.node);
        }
    }
    return false;
}

/** Можно ли соединить выход `from` с входом `to`. Граф не меняет. */
export function canConnect(graph: Graph, registry: Registry, from: PinRef, to: PinRef): CheckResult {
    const fromNode = graph.nodes[from.node];
    const toNode = graph.nodes[to.node];
    if (!fromNode || !toNode) return fail('Нода не найдена');
    if (fromNode.id === toNode.id) return fail('Нельзя соединить ноду с самой собой');

    const outPin = pinOf(registry, graph, from, 'out');
    const inPin = pinOf(registry, graph, to, 'in');
    if (!outPin) return fail(`У ноды "${fromNode.type}" нет выхода "${from.pin}"`);
    if (!inPin) return fail(`У ноды "${toNode.type}" нет входа "${to.pin}"`);

    if (outPin.kind !== inPin.kind) return fail('Exec-пин нельзя соединить с data-пином');
    if (!typesCompatible(outPin, inPin)) {
        return fail(`Несовместимые типы: ${(outPin as { type: string }).type} → ${(inPin as { type: string }).type}`);
    }

    // Циклы по data-связям недопустимы: чистые ноды вычисляются рекурсивно.
    // Циклы по exec — это обычные циклы выполнения, их разрешаем.
    if (outPin.kind === 'data' && reachesByData(graph, registry, to.node, from.node)) {
        return fail('Соединение создаёт цикл по данным');
    }

    return { ok: true };
}

/** Проверка загруженного графа целиком: типы нод, пины, циклы по данным. */
export function validateGraph(graph: Graph, registry: Registry): string[] {
    const errors: string[] = [];

    for (const node of Object.values(graph.nodes)) {
        if (!registry.has(node.type)) errors.push(`Нода ${node.id}: неизвестный тип "${node.type}"`);
    }
    if (errors.length) return errors;

    // Проверяем каждую связь так, как будто добавляем её в граф без неё.
    for (const c of graph.connections) {
        const rest = { ...graph, connections: graph.connections.filter((x) => x !== c) };
        const res = canConnect(rest, registry, c.from, c.to);
        if (!res.ok) errors.push(`Связь ${c.id}: ${res.reason}`);
    }

    return errors;
}

/**
 * Удаляет связи, которые перестали быть допустимыми (например, после смены типа переменной).
 * Возвращает, сколько связей удалено.
 */
export function pruneInvalidConnections(graph: Graph, registry: Registry): number {
    const before = graph.connections.length;
    const all = graph.connections;

    graph.connections = all.filter((c) => {
        const rest = { ...graph, connections: all.filter((x) => x !== c) };
        return canConnect(rest, registry, c.from, c.to).ok;
    });

    return before - graph.connections.length;
}
