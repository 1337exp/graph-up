/**
 * Камера: экранная точка = мировая * z + (x, y).
 * Экранные координаты здесь — относительно левого верхнего угла холста.
 */
export interface Camera {
    x: number;
    y: number;
    z: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;

export const createCamera = (): Camera => ({ x: 0, y: 0, z: 1 });

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
    return [(sx - cam.x) / cam.z, (sy - cam.y) / cam.z];
}

export function worldToScreen(cam: Camera, wx: number, wy: number): [number, number] {
    return [wx * cam.z + cam.x, wy * cam.z + cam.y];
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
    return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Масштаб в `factor` раз; точка под курсором (sx, sy) остаётся на месте. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.z * factor));
    const k = z / cam.z;
    return { x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k, z };
}
