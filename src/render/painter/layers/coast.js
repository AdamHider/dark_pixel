import { mixPacked } from '../../color.js';

/* Скругление углов побережья.

   Клетки — квадраты, поэтому берег «из воды в сушу» идёт ступеньками. Раньше берег сглаживали размытием
   маски воды на уровне клеток — это давало «съеденный» берег и сложную логику. Теперь проще: у каждой
   прибрежной клетки-суши подрезаем углы, которые смотрят в воду по диагонали. Квадрат превращается в
   восьмиугольник с округлыми углами — берег выглядит естественно, а тело клетки не меняется.

   Подрезка — четверть круга радиусом ~0.45 клетки в каждом таком углу. Это меньше половины площади, поэтому
   клетка всегда остаётся в основном своего типа (при наведении тип совпадает с рисунком). */
export const coast = {
    // Угловые смещения клетки: (dx, dy). Для каждого проверяем диагонального соседа.
    CORNERS: [[-1, -1], [1, -1], [-1, 1], [1, 1]],

    // Скруглённые углы: вода становится на место «срезанного» угла прибрежной суши.
    roundCoastCorners() {
        if (this.view !== 'terrain' || !this.tileWater) return;
        const size = this.map.size;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const water = this.waterMask;
        const waterTile = this.tileWater;
        const radius = Math.max(2, Math.round(T * 0.45));
        const r2 = radius * radius;
        const isWaterTile = (tx, ty) => tx >= 0 && ty >= 0 && tx < size && ty < size && !!waterTile[ty * size + tx];

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const i = ty * size + tx;
                if (waterTile[i]) continue;                             // подрезаем только углы суши
                const x0 = tx * T, y0 = ty * T;
                for (const [dx, dy] of this.CORNERS) {
                    if (!isWaterTile(tx + dx, ty + dy)) continue;       // вода только по диагонали — угол «выступает»
                    const waterColor = this.tileColors[(ty + dy) * size + (tx + dx)];
                    const cx = dx < 0 ? x0 : x0 + T - 1;
                    const cy = dy < 0 ? y0 : y0 + T - 1;
                    for (let gy = y0; gy < y0 + T; gy++) {
                        const ddy = gy - cy;
                        for (let gx = x0; gx < x0 + T; gx++) {
                            const ddx = gx - cx;
                            if (ddx * ddx + ddy * ddy > r2) continue;
                            const k = gy * W + gx;
                            if (water[k]) continue;
                            pixels[k] = mixPacked(pixels[k], waterColor, 0.8);  // мягкая кромка среза
                            water[k] = 1;
                        }
                    }
                }
            }
        }
    },
};
