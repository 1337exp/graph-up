import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RunPanel from '@/editor/components/RunPanel.vue';
import { useRun } from '@/editor/run';

describe('RunPanel', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('строки лога не размножают панель (регресс: класс строки совпал с классом панели)', async () => {
        const run = useRun();
        run.slow = false;
        await run.run();
        await run.run();

        const wrapper = mount(RunPanel);
        expect(wrapper.findAll('.log-panel')).toHaveLength(1);
        // каждая строка вывода ноды — просто строка внутри панели
        const outputLines = wrapper.findAll('.line.kind-log');
        expect(outputLines).toHaveLength(2);
        for (const line of outputLines) expect(line.element.closest('.log-panel')).not.toBeNull();
    });
});
