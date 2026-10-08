/** Правки с одним ключом, сделанные чаще чем раз в столько мс, склеиваются в одну запись (набор числа в поле и т.п.). */
export const COALESCE_MS = 800;

/**
 * История состояний для undo/redo: линейный список снимков и указатель на текущий.
 * Снимки — строки (JSON графа): они неизменяемы, их легко сравнивать и не нужно копировать.
 */
export class History {
    private states: string[];
    private index = 0;
    private lastKey: string | undefined;
    private lastTime = 0;

    constructor(
        initial: string,
        private readonly limit = 100,
        private readonly now: () => number = Date.now,
    ) {
        this.states = [initial];
    }

    get canUndo(): boolean {
        return this.index > 0;
    }

    get canRedo(): boolean {
        return this.index < this.states.length - 1;
    }

    /**
     * Записывает новое состояние. Если оно не отличается от текущего, ничего не делает (вернёт false).
     * Правка отбрасывает «будущее» (redo). С одинаковым `key` подряд и в пределах `COALESCE_MS`
     * правки заменяют друг друга, а не копятся.
     */
    commit(state: string, key?: string): boolean {
        if (state === this.states[this.index]) return false;

        const t = this.now();
        const atTop = this.index === this.states.length - 1;
        const coalesce = key !== undefined && key === this.lastKey && t - this.lastTime <= COALESCE_MS && this.index > 0 && atTop;

        if (coalesce) {
            this.states[this.index] = state;
            // Вернулись к состоянию до серии правок: запись не нужна.
            if (this.states[this.index - 1] === state) {
                this.states.pop();
                this.index--;
            }
        } else {
            this.states.length = this.index + 1;
            this.states.push(state);
            this.index++;
            if (this.states.length > this.limit + 1) {
                this.states.shift();
                this.index--;
            }
        }

        this.lastKey = key;
        this.lastTime = t;
        return true;
    }

    /** Возвращает предыдущее состояние или null, если отменять нечего. */
    undo(): string | null {
        if (!this.canUndo) return null;
        this.lastKey = undefined;
        return this.states[--this.index]!;
    }

    redo(): string | null {
        if (!this.canRedo) return null;
        this.lastKey = undefined;
        return this.states[++this.index]!;
    }

    /** Начать историю заново (например, после загрузки файла). */
    reset(state: string): void {
        this.states = [state];
        this.index = 0;
        this.lastKey = undefined;
    }
}
