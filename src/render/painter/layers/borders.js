import { mixPacked } from '../../color.js';
import { BAYER } from '../constants.js';
import { hashUnit } from '../noise.js';

/* Границы регионов.

   Старая версия рисовала тонкую линию по правому/нижнему краю клетки — получался «дешёвый» прямоугольный контур
   по сетке. Теперь граница — мягкая тёмная тень: она идёт вдоль края региона и чуть заходит внутрь, к своему
   центру, а снаружи её ограничивает крупный шум, поэтому линия волнистая, а не по сетке клеток. */
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

    // Границы регионов: мягкая тень вдоль края региона, изрезанная крупным шумом.
    paintRegionBorders() {
        const { size, regionId } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const relief = this.reliefHeight;
        const ink = this.colors.regionBorder;
        const radius = Math.max(2, this.px(4));

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
                    if (this.riverMask && this.riverMask[k]) continue;    // над водой границы не рисуем

                    const toRight = edgeRight ? T - ox : Infinity;        // расстояние до правого края клетки
                    const toBottom = edgeBelow ? T - oy : Infinity;
                    const dist = Math.min(toRight, toBottom);
                    if (dist > radius) continue;

                    const d = dist - this.borderNoise(gx, gy) * radius * 0.9;   // излом: местами вглубь, местами к краю
                    if (d >= radius || d <= 0) continue;
                    let alpha = (d / radius) * 0.5;
                    if (relief) alpha *= 0.4 + 0.6 * (1 - Math.min(1, relief[k] / 110));  // в горах границы почти растворяются
                    if (BAYER[(gy & 3) * 4 + (gx & 3)] >= alpha * 2) continue;   // мягкая пиксельная кромка
                    pixels[k] = mixPacked(pixels[k], ink, alpha);
                }
            }
        }
    },
};
