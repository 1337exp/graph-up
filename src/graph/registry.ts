import type { AnyNodeDef, NodeDef, PinDefs } from './types';

export class Registry {
    private readonly defs = new Map<string, AnyNodeDef>();

    register<I extends PinDefs, O extends PinDefs>(def: NodeDef<I, O>): this {
        if (this.defs.has(def.id)) throw new Error(`Нода "${def.id}" уже зарегистрирована`);
        this.defs.set(def.id, def as unknown as AnyNodeDef);
        return this;
    }

    get(id: string): AnyNodeDef {
        const def = this.defs.get(id);
        if (!def) throw new Error(`Неизвестный тип ноды "${id}"`);
        return def;
    }

    has(id: string): boolean {
        return this.defs.has(id);
    }

    all(): AnyNodeDef[] {
        return [...this.defs.values()];
    }
}
