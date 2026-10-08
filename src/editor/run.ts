import { defineStore } from 'pinia';
import { ref } from 'vue';
import { execute, ExecutionError } from '@/graph/execute';
import type { Graph } from '@/graph/types';
import type { MessageArgs, MessageKey } from '@/i18n';
import { useEditor } from './store';

/**
 * Строки лога хранят ключ перевода, а не готовый текст: при смене языка лог перерисуется целиком.
 * Исключение — `log`: это текст, который вывела сама нода (Print).
 */
export type LogLine =
    | { kind: 'log'; text: string; nodeId?: string }
    | { kind: 'info' | 'error'; key: MessageKey; args?: MessageArgs; nodeId?: string };

export const SLOW_STEP_MS = 300;

/** Какой перевод соответствует ошибке исполнения. */
function describeError(e: ExecutionError): Pick<Extract<LogLine, { key: MessageKey }>, 'kind' | 'key' | 'args'> {
    switch (e.kind) {
        case 'aborted':
            return { kind: 'info', key: 'run.stopped' };
        case 'limit':
            return { kind: 'error', key: 'run.limit', args: [e.params.maxSteps ?? ''] };
        case 'nodeNotFound':
            return { kind: 'error', key: 'run.nodeNotFound', args: [e.params.id ?? ''] };
        case 'dataCycle':
            return { kind: 'error', key: 'run.dataCycle' };
        case 'nodeError':
            return { kind: 'error', key: 'run.nodeError', args: [e.params.message ?? e.message] };
    }
}

export const useRun = defineStore('run', () => {
    const running = ref(false);
    const slow = ref(true);
    const activeNode = ref<string | null>(null);
    const errorNode = ref<string | null>(null);
    const lines = ref<LogLine[]>([]);

    let controller: AbortController | null = null;

    function push(line: LogLine) {
        lines.value.push(line);
    }

    function clearLog() {
        lines.value = [];
    }

    function stop() {
        controller?.abort();
    }

    async function run() {
        if (running.value) return;

        const editor = useEditor();
        // Исполняем снимок: правки графа во время запуска не влияют на текущий прогон.
        const snapshot: Graph = JSON.parse(JSON.stringify(editor.graph));

        const start = Object.values(snapshot.nodes).find((n) => n.type === 'flow/start');
        if (!start) {
            push({ kind: 'error', key: 'run.noStart' });
            return;
        }

        controller = new AbortController();
        running.value = true;
        errorNode.value = null;
        push({ kind: 'info', key: 'run.started' });

        try {
            const result = await execute(snapshot, editor.registry, start.id, {
                signal: controller.signal,
                stepDelay: slow.value ? SLOW_STEP_MS : 0,
                onStep: (id) => (activeNode.value = id),
                onLog: (text, nodeId) => push({ kind: 'log', text, nodeId }),
            });
            push({ kind: 'info', key: 'run.done', args: [result.steps] });
        } catch (e) {
            if (e instanceof ExecutionError) {
                push({ ...describeError(e), nodeId: e.nodeId });
                if (e.kind !== 'aborted') errorNode.value = e.nodeId ?? null;
            } else {
                push({ kind: 'error', key: 'run.unknownError', args: [String(e)] });
            }
        } finally {
            running.value = false;
            activeNode.value = null;
            controller = null;
        }
    }

    return { running, slow, activeNode, errorNode, lines, run, stop, clearLog };
});
