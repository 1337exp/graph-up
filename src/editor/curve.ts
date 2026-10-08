/** Кубическая кривая Безье с горизонтальными касательными, как в Blueprint. */
export function curvePath(x1: number, y1: number, x2: number, y2: number): string {
    const tension = Math.max(Math.abs(x2 - x1) * 0.5, 60);
    return `M ${x1} ${y1} C ${x1 + tension} ${y1}, ${x2 - tension} ${y2}, ${x2} ${y2}`;
}
