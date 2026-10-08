import type { Registry } from './registry';
import type { Graph, PinDef, PinRef } from './types';

export type CheckResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CheckResult => ({ ok: false, reason });

function typesCompatible(out: PinDef, inp: PinDef): boolean {
    if (out.kind === 'exec' || inp.kind === 'exec') return out.kind === inp.kind;
    return out.type === 'any' || inp.type === 'any' || out.type === inp.type;
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

        const def = registry.get(graph.nodes[id]!.type);
        for (const c of graph.connections) {
            if (c.from.node === id && def.outputs[c.from.pin]?.kind === 'data') stack.push(c.to.node);
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

    const outPin = registry.get(fromNode.type).outputs[from.pin];
    const inPin = registry.get(toNode.type).inputs[to.pin];
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
