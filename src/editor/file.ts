/** Размер файла, больше которого не открываем: граф на сотни нод весит десятки КБ. */
export const MAX_FILE_BYTES = 5_000_000;

export const FILE_NAME = 'graph-up.json';

/** Скачивание текста как файла через временную ссылку. */
export function downloadText(filename: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Браузер должен успеть начать скачивание, поэтому освобождаем ссылку не сразу.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
