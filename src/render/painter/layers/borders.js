import { mixPacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Границы регионов.

   Граница — плотная тёмная кромка вдоль края региона: она заходит внутрь своей клетки на фиксированную
   ширину, а снаружи её ограничивает крупный шум, поэтому линия волнистая, а не строго по сетке клеток.
   Край всегда плотный (без дизеринга), иначе линия «растворяется» в мелких масштабах. */
export const borders = {
    // Крупный волнистый шум границы: одна и та же функция для пикселя, поэтому линия непрерывна.
    borderNoise(gx, gy) {
        const cell = Math.max(8, this.px(24));
        const fx = gx / cell, fy = gy / cell;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const u = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const v = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const a = hashUnit(ix, iy, 1301), b = hashUnit(ix + 1, iy, 1301);
        const c = hashUnit(ix, iy + 1, 1301), d = hashUnit(ix + 1, iy + 1, 1301);
        const top = a + (b - a) * u;
        return top + (c + (d - c) * u - top) * v;
    },

    // Границы регионов: плотная тёмная кромка вдоль края региона, изрезанная крупным шумом.
    paintRegionBorders() {
        const { size, regionId } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const relief = this.reliefHeight;
        const ink = this.colors.regionBorder;
        const radius = Math.max(2, this.px(3));   // ширина кромки внутрь клетки

        for (let tile = 0; tile < size * size; tile++) {
            const id = regionId[tile];
            if (id === -1) continue;
            const tx = tile % size, ty = Math.floor(tile / size);
            const right = tx < size - 1 ? regionId[tile + 1] : id;
            const below = ty < size - 1 ? regionId[tile + size] : id;
            const edgeRight = tx < size - 1 && right !== -1 && right !== id;
            const edgeBelow = ty < size - 1 && below !== -1 && below !== id;
            if (!edgeRight && !edgeBelow) continue;

            const x0 = tx * T, y0 = ty * T;
            for (let oy = 0; oy < T; oy++) {
                const gy = y0 + oy;
                for (let ox = 0; ox < T; ox++) {
                    const gx = x0 + ox;
                    const k = gy * W + gx;
                    if (this.waterMask && this.waterMask[k]) continue;    // по воде границы не рисуем
                    if (this.riverMask && this.riverMask[k]) continue;    // и над реками

                    const toRight = edgeRight ? T - ox : Infinity;        // расстояние до правого края клетки
                    const toBottom = edgeBelow ? T - oy : Infinity;
                    const dist = Math.min(toRight, toBottom);
                    if (dist > radius) continue;

                    const d = dist - this.borderNoise(gx, gy) * radius;    // излом: местами вглубь, местами к краю
                    if (d >= radius || d <= 0) continue;
                    let alpha = 0.85;                                      // плотная кромка, без дизеринга
                    if (relief) alpha *= 0.5 + 0.5 * (1 - Math.min(1, relief[k] / 110)); // в горах границы чуть слабее
                    pixels[k] = mixPacked(pixels[k], ink, alpha);
                }
            }
        }
    },
};
