/**
 * Переводы названий нод. Необязательны: у каждой ноды в файле есть английские `title` и `label`,
 * они используются, когда перевода нет. Так новая нода работает без правок словарей.
 */
export interface NodeTexts {
    /** Названия категорий (первая часть id ноды): `math` → «Математика». */
    categories: Record<string, string>;
    nodes: Record<string, { title?: string; pins?: Record<string, string> }>;
}
