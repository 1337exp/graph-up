import { CONCRETE_TYPES, coerce, DEFAULT_BY_TYPE, type ConcreteType } from './coerce';
import { pinOf } from './pins';
import type { Registry } from './registry';
import type { Connection, Graph, NodeInstance, Variable } from './types';
import { pruneInvalidConnections } from './validate';

/** Имя формата в файле: по нему отличаем наш файл от любого другого JSON. */
export const FORMAT = 'graph-up';
/** Версия схемы. При несовместимых изменениях увеличиваем и добавляем миграцию в `migrate`. */
export const VERSION = 1;

/** Положение камеры в файле: чтобы граф открывался там, где его оставили. */
export interface SavedView {
    x: number;
    y: number;
    z: number;
}

export type LoadErrorCode = 'invalidJson' | 'notGraphFile' | 'newerVersion' | 'invalidStructure' | 'unknownNode';

/** Причина отказа; текст для пользователя собирает UI по `code` (в `detail` — то, что подставить в сообщение). */
export interface LoadError {
    code: LoadErrorCode;
    detail?: string;
}

export type ParseResult =
    | { ok: true; graph: Graph; view?: SavedView; droppedConnections: number }
    | { ok: false; error: LoadError };

export function serialize(graph: Graph, view?: SavedView, pretty = true): string {
    return JSON.stringify({ format: FORMAT, version: VERSION, view, graph }, null, pretty ? 2 : undefined);
}

//--------------------------------------------------
// Разбор: файл приходит извне, поэтому ничему не доверяем.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ключи, которыми можно подменить прототип объекта, если использовать их как id. */
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

class Invalid extends Error {
    constructor(readonly error: LoadError) {
        super(error.code);
    }
}

const bad = (detail: string): never => {
    throw new Invalid({ code: 'invalidStructure', detail });
};

/** Приведение старых версий схемы к текущей. Сейчас версия одна, так что просто возвращаем как есть. */
function migrate(file: Obj, _version: number): Obj {
    return file;
}

function parseNode(key: string, raw: unknown): NodeInstance {
    if (!isObj(raw)) return bad(`nodes.${key}`);
    if (!isStr(raw.id) || raw.id !== key || FORBIDDEN_IDS.has(raw.id)) return bad(`nodes.${key}.id`);
    if (!isStr(raw.type)) return bad(`nodes.${key}.type`);
    if (!isNum(raw.x) || !isNum(raw.y)) return bad(`nodes.${key}.x/y`);
    if (raw.values !== undefined && !isObj(raw.values)) return bad(`nodes.${key}.values`);
    if (raw.config !== undefined && !isObj(raw.config)) return bad(`nodes.${key}.config`);

    const node: NodeInstance = { id: raw.id, type: raw.type, x: raw.x, y: raw.y, values: { ...(raw.values as Obj | undefined) } };
    if (raw.config !== undefined) node.config = { ...(raw.config as Obj) };
    return node;
}

function parseConnection(index: number, raw: unknown): Connection {
    const ref = (value: unknown, path: string) => {
        if (!isObj(value) || !isStr(value.node) || !isStr(value.pin)) return bad(path);
        const r = value as { node: string; pin: string };
        return { node: r.node, pin: r.pin };
    };

    if (!isObj(raw) || !isStr(raw.id)) return bad(`connections[${index}]`);
    return { id: raw.id, from: ref(raw.from, `connections[${index}].from`), to: ref(raw.to, `connections[${index}].to`) };
}

function parseVariable(index: number, raw: unknown): Variable {
    if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name)) return bad(`variables[${index}]`);
    if (!isStr(raw.type) || !(CONCRETE_TYPES as readonly string[]).includes(raw.type)) return bad(`variables[${index}].type`);

    const type = raw.type as ConcreteType;
    const converted = coerce(type, raw.default);
    const usable = converted !== undefined && !(typeof converted === 'number' && Number.isNaN(converted));
    return { id: raw.id, name: raw.name, type, default: usable ? converted : DEFAULT_BY_TYPE[type] };
}

function parseView(raw: unknown): SavedView | undefined {
    if (!isObj(raw) || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.z) || raw.z <= 0) return undefined;
    return { x: raw.x, y: raw.y, z: raw.z };
}

function uniqueIds(items: { id: string }[], what: string) {
    if (new Set(items.map((i) => i.id)).size !== items.length) bad(`${what}: duplicate id`);
}

/**
 * Разбирает и проверяет файл. Структурные ошибки и неизвестные типы нод отклоняют файл целиком.
 * Недопустимые связи (несуществующие пины, несовместимые типы, лишние связи в один вход) не причина
 * терять весь граф: они отбрасываются, а их число возвращается в `droppedConnections`.
 */
export function parse(text: string, registry: Registry): ParseResult {
    try {
        let file: unknown;
        try {
            file = JSON.parse(text);
        } catch {
            throw new Invalid({ code: 'invalidJson' });
        }

        if (!isObj(file) || file.format !== FORMAT) throw new Invalid({ code: 'notGraphFile' });
        if (!isNum(file.version) || !Number.isInteger(file.version) || file.version < 1) return bad('version');
        if (file.version > VERSION) throw new Invalid({ code: 'newerVersion', detail: String(file.version) });

        const data = migrate(file, file.version);
        const rawGraph = data.graph;
        if (!isObj(rawGraph) || !isObj(rawGraph.nodes) || !Array.isArray(rawGraph.connections)) return bad('graph');
        if (rawGraph.variables !== undefined && !Array.isArray(rawGraph.variables)) return bad('graph.variables');

        const graph: Graph = { nodes: {}, connections: [], variables: [] };

        for (const [key, raw] of Object.entries(rawGraph.nodes)) graph.nodes[key] = parseNode(key, raw);
        graph.connections = rawGraph.connections.map((c, i) => parseConnection(i, c));
        graph.variables = (rawGraph.variables ?? []).map((v: unknown, i: number) => parseVariable(i, v));
        uniqueIds(graph.connections, 'connections');
        uniqueIds(graph.variables, 'variables');

        for (const node of Object.values(graph.nodes)) {
            if (!registry.has(node.type)) throw new Invalid({ code: 'unknownNode', detail: node.type });
        }

        const before = graph.connections.length;
        pruneInvalidConnections(graph, registry);
        dropExtraLinks(graph, registry);

        return { ok: true, graph, view: parseView(data.view), droppedConnections: before - graph.connections.length };
    } catch (e) {
        if (e instanceof Invalid) return { ok: false, error: e.error };
        throw e;
    }
}

/** В data-вход ведёт одна связь, из exec-выхода выходит одна: лишние (из рукописного файла) отбрасываем. */
function dropExtraLinks(graph: Graph, registry: Registry) {
    const seen = new Set<string>();

    graph.connections = graph.connections.filter((c) => {
        const out = pinOf(registry, graph, c.from, 'out');
        const inp = pinOf(registry, graph, c.to, 'in');
        const keys = [
            inp?.kind === 'data' ? `in:${c.to.node}:${c.to.pin}` : null,
            out?.kind === 'exec' ? `out:${c.from.node}:${c.from.pin}` : null,
        ].filter((k): k is string => k !== null);

        if (keys.some((k) => seen.has(k))) return false;
        for (const k of keys) seen.add(k);
        return true;
    });
}
