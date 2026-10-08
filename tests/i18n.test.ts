import { describe, expect, it } from 'vitest';
import { detectLocale, LOCALES, translate, translateCategory, translateNodeTitle, translatePinLabel } from '@/i18n';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

describe('translate', () => {
    it('подставляет аргументы', () => {
        expect(translate('ru', 'run.limit', [100])).toBe('✖ Превышен лимит шагов (100)');
        expect(translate('en', 'run.limit', [100])).toBe('✖ Step limit exceeded (100)');
    });

    it('оставляет плейсхолдер, если аргумента нет', () => {
        expect(translate('en', 'run.done')).toBe('✔ Done: {0} step(s)');
    });
});

describe('detectLocale', () => {
    it('берёт первый поддерживаемый язык браузера', () => {
        expect(detectLocale(['de-DE', 'ru-RU', 'en-US'])).toBe('ru');
        expect(detectLocale(['en_GB'])).toBe('en');
    });

    it('без совпадений — английский', () => {
        expect(detectLocale(['de', 'fr'])).toBe('en');
        expect(detectLocale([])).toBe('en');
    });
});

describe('тексты нод', () => {
    const add = registry.get('math/add');

    it('переводят название, пины и категорию', () => {
        expect(translateNodeTitle('ru', add)).toBe('Сложение');
        expect(translatePinLabel('ru', 'flow/branch', 'then', 'True')).toBe('Да');
        expect(translateCategory('ru', 'math')).toBe('Математика');
    });

    it('без перевода берут английский из самой ноды', () => {
        expect(translateNodeTitle('en', add)).toBe('Add');
        expect(translatePinLabel('en', 'flow/branch', 'then', 'True')).toBe('True');
        expect(translatePinLabel('ru', 'flow/branch', 'unknown', 'Fallback')).toBe('Fallback');
        expect(translatePinLabel('ru', 'math/add', 'a')).toBe('a');
        expect(translateCategory('en', 'math')).toBe('Math');
        expect(translateNodeTitle('ru', { id: 'x/new', title: 'New node' })).toBe('New node');
    });

    it('переводы не ссылаются на несуществующие ноды и пины', () => {
        for (const [code, dict] of Object.entries(LOCALES)) {
            for (const [id, texts] of Object.entries(dict.nodeTexts.nodes)) {
                expect(registry.has(id), `${code}: нет ноды ${id}`).toBe(true);
                const def = registry.get(id);
                const pins = new Set([...Object.keys(def.inputs), ...Object.keys(def.outputs)]);
                for (const pin of Object.keys(texts.pins ?? {})) {
                    expect(pins.has(pin), `${code}: у ${id} нет пина ${pin}`).toBe(true);
                }
            }
        }
    });
});
