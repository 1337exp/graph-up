import type { NodeTexts } from './types';

// Источник правды для ключей: en.ts обязан повторять эту структуру (проверяет компилятор).
// `nodeTexts` устроен иначе: он необязателен для нод и в проверку ключей не входит.
export default {
    ui: {
        language: 'Язык',
    },

    run: {
        run: 'Запустить',
        stop: 'Стоп',
        slow: 'Медленно ({0} мс/шаг)',
        started: '▶ Запуск',
        done: '✔ Готово: {0} шаг(ов)',
        stopped: '■ Остановлено',
        noStart: '✖ В графе нет ноды Start',
        limit: '✖ Превышен лимит шагов ({0})',
        nodeNotFound: '✖ Нода «{0}» не найдена',
        dataCycle: '✖ Цикл по данным',
        nodeError: '✖ Ошибка в ноде: {0}',
        unknownError: '✖ {0}',
    },

    log: {
        title: 'Лог',
        clear: 'Очистить',
        empty: 'Нажми «Запустить» — результаты появятся здесь',
    },

    palette: {
        add: 'Добавить ноду',
        compatible: 'Совместимые ноды',
        search: 'Поиск…',
        empty: 'Ничего не найдено',
    },

    nodeTexts: {
        categories: {
            flow: 'Поток',
            math: 'Математика',
            debug: 'Отладка',
        },
        nodes: {
            'flow/start': { title: 'Старт' },
            'flow/branch': { title: 'Ветвление', pins: { condition: 'Условие', then: 'Да', else: 'Нет' } },
            'math/add': { title: 'Сложение', pins: { result: 'результат' } },
            'math/greater': { title: 'Больше', pins: { result: 'результат' } },
            'debug/print': { title: 'Вывод', pins: { message: 'сообщение' } },
        },
    } as NodeTexts,
};
