import { Registry } from '@/graph/registry';
import type { AnyNodeDef } from '@/graph/types';

// Каждый файл в nodes/**: `export default defineNode(...)`. Положил файл — нода в реестре.
const modules = import.meta.glob<{ default: AnyNodeDef }>(['./**/*.ts', '!./index.ts'], { eager: true });

export function createDefaultRegistry(): Registry {
    const registry = new Registry();
    for (const mod of Object.values(modules)) registry.register(mod.default);
    return registry;
}
