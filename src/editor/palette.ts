import type { AnyNodeDef, PinDef } from '@/graph/types';
import { typesCompatible } from '@/graph/validate';

/** Категория — часть id до «/»: `math/add` → `math`. */
export const categoryOf = (def: AnyNodeDef): string => (def.id.includes('/') ? def.id.split('/')[0]! : 'other');

export const categoryTitle = (category: string): string => category.charAt(0).toUpperCase() + category.slice(1);

/** Ноды, подходящие под запрос (все слова должны встретиться в названии или id), по категориям и названиям. */
export function filterNodes(defs: AnyNodeDef[], query: string): AnyNodeDef[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    return defs
        .filter((def) => {
            const haystack = `${def.title} ${def.id}`.toLowerCase();
            return words.every((w) => haystack.includes(w));
        })
        .sort((a, b) => categoryOf(a).localeCompare(categoryOf(b)) || a.title.localeCompare(b.title));
}

export interface NodeGroup {
    category: string;
    nodes: AnyNodeDef[];
}

export function groupByCategory(defs: AnyNodeDef[]): NodeGroup[] {
    const groups: NodeGroup[] = [];
    for (const def of defs) {
        const category = categoryOf(def);
        const last = groups[groups.length - 1];
        if (last?.category === category) last.nodes.push(def);
        else groups.push({ category, nodes: [def] });
    }
    return groups;
}

/**
 * Пин ноды `def`, к которому можно подключить пин `origin` (с направлением `originDir`).
 * Точное совпадение типа предпочитаем `any`. Если подходящего пина нет, null.
 */
export function findCompatiblePin(origin: PinDef, originDir: 'in' | 'out', def: AnyNodeDef): string | null {
    const candidates = Object.entries(originDir === 'out' ? def.inputs : def.outputs).filter(([, pin]) =>
        originDir === 'out' ? typesCompatible(origin, pin) : typesCompatible(pin, origin),
    );

    const exact = candidates.find(([, pin]) => pin.kind === 'exec' || (origin.kind === 'data' && pin.kind === 'data' && pin.type === origin.type));
    return (exact ?? candidates[0])?.[0] ?? null;
}
