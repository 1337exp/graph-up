import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, panBy, screenToWorld, worldToScreen, zoomAt } from '@/editor/camera';

describe('camera', () => {
    it('screenToWorld и worldToScreen взаимно обратны', () => {
        const cam = { x: 40, y: -20, z: 1.5 };
        const [wx, wy] = screenToWorld(cam, 300, 200);
        const [sx, sy] = worldToScreen(cam, wx, wy);
        expect(sx).toBeCloseTo(300);
        expect(sy).toBeCloseTo(200);
    });

    it('zoomAt держит мировую точку под курсором', () => {
        const cam = panBy({ x: 0, y: 0, z: 1 }, 100, 50);
        const before = screenToWorld(cam, 400, 300);
        const next = zoomAt(cam, 400, 300, 1.6);
        const after = screenToWorld(next, 400, 300);
        expect(next.z).toBeCloseTo(1.6);
        expect(after[0]).toBeCloseTo(before[0]);
        expect(after[1]).toBeCloseTo(before[1]);
    });

    it('zoomAt ограничивает масштаб', () => {
        const cam = { x: 0, y: 0, z: 1 };
        expect(zoomAt(cam, 0, 0, 100).z).toBe(MAX_ZOOM);
        expect(zoomAt(cam, 0, 0, 0.001).z).toBe(MIN_ZOOM);
    });
});
