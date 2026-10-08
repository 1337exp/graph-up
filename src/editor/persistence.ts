/**
 * Хранилище автосохранения (localStorage). Любая операция может не сработать: приватный режим,
 * запрет сайта, переполнение квоты. Поэтому ошибки глушим и сообщаем результатом, а не исключением.
 */
const KEY = 'graph-up.graph';
const BROKEN_KEY = 'graph-up.graph.broken';

export function readSaved(): string | null {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

export function writeSaved(text: string): boolean {
    try {
        localStorage.setItem(KEY, text);
        return true;
    } catch {
        return false;
    }
}

/** Сохранённый граф не удалось прочитать: откладываем копию, чтобы автосохранение её не затёрло. */
export function backupBroken(text: string): void {
    try {
        localStorage.setItem(BROKEN_KEY, text);
    } catch {
        // нечего делать: места нет
    }
}
