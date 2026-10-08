import type ru from './ru';
import type { NodeTexts } from './types';

// Все ключи ru.ts должны быть здесь, лишних быть не должно (satisfies проверяет оба направления).
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
type Strict = Omit<typeof ru, 'nodeTexts'>;

export default {
    ui: {
        language: 'Language',
    },

    history: {
        undo: 'Undo (Ctrl+Z)',
        redo: 'Redo (Ctrl+Y)',
    },

    types: {
        boolean: 'Boolean',
        int: 'Integer',
        float: 'Float',
        string: 'String',
        any: 'Any',
    },

    variables: {
        title: 'Variables',
        add: 'Add',
        get: 'Get',
        set: 'Set',
        remove: 'Delete',
        empty: 'No variables yet. Create one, then add Get/Set to the canvas.',
        removedLinks: 'Links removed: {0}',
        broken: 'Variable was deleted',
    },

    run: {
        run: 'Run',
        stop: 'Stop',
        slow: 'Slow ({0} ms/step)',
        started: '▶ Started',
        done: '✔ Done: {0} step(s)',
        stopped: '■ Stopped',
        noStart: '✖ The graph has no Start node',
        limit: '✖ Step limit exceeded ({0})',
        depth: '✖ Nesting too deep ({0})',
        nodeNotFound: '✖ Node "{0}" not found',
        dataCycle: '✖ Data cycle',
        nodeError: '✖ Node error: {0}',
        unknownError: '✖ {0}',
    },

    log: {
        title: 'Log',
        clear: 'Clear',
        empty: 'Press Run: the results will appear here',
    },

    palette: {
        add: 'Add node',
        compatible: 'Compatible nodes',
        search: 'Search…',
        empty: 'Nothing found',
    },

    // Английские названия лежат в самих нодах, здесь переопределять нечего.
    nodeTexts: { categories: {}, nodes: {} } as NodeTexts,
} satisfies DeepStrings<Strict> & { nodeTexts: NodeTexts };
