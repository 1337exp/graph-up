import { canConnect } from './validate';
import type { Registry } from './registry';
import type { Connection, Graph, NodeInstance, PinRef } from './types';

let counter = 0;
const uid = (prefix: string, taken: (id: string) => boolean = () => false) => {
    let id: string;
    do id = `${prefix}${++counter}`;
    while (taken(id));
    return id;
};

export function createGraph(): Graph {
    return { nodes: {}, connections: [] };
}

export function addNode(
    graph: Graph,
    registry: Registry,
    type: string,
    init: Partial<Omit<NodeInstance, 'type'>> = {},
): NodeInstance {
    registry.get(type); // бросит ошибку, если типа нет

    const node: NodeInstance = { id: init.id ?? uid('n', (id) => id in graph.nodes), type, x: 0, y: 0, values: {}, ...init };
    if (graph.nodes[node.id]) throw new Error(`Нода с id "${node.id}" уже есть`);

    graph.nodes[node.id] = node;
    return node;
}

export function removeNode(graph: Graph, nodeId: string): void {
    delete graph.nodes[nodeId];
    graph.connections = graph.connections.filter((c) => c.from.node !== nodeId && c.to.node !== nodeId);
}

/**
 * Соединяет выход `from` с входом `to`. Бросает ошибку, если соединение недопустимо.
 * Как в Blueprint: новая связь вытесняет старую, если пин не допускает несколько связей
 * (data-вход и exec-выход). В exec-вход, наоборот, может вести сколько угодно связей.
 */
export function connect(graph: Graph, registry: Registry, from: PinRef, to: PinRef): Connection {
    const check = canConnect(graph, registry, from, to);
    if (!check.ok) throw new Error(check.reason);

    const fromKind = registry.get(graph.nodes[from.node]!.type).outputs[from.pin]!.kind;

    graph.connections = graph.connections.filter((c) => {
        const sameInput = fromKind === 'data' && c.to.node === to.node && c.to.pin === to.pin;
        const sameExecOutput = fromKind === 'exec' && c.from.node === from.node && c.from.pin === from.pin;
        return !sameInput && !sameExecOutput;
    });

    const connection: Connection = { id: uid('c', (id) => graph.connections.some((c) => c.id === id)), from, to };
    graph.connections.push(connection);
    return connection;
}

export function disconnect(graph: Graph, connectionId: string): void {
    graph.connections = graph.connections.filter((c) => c.id !== connectionId);
}
