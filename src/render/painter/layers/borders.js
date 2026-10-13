import { mixPacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Границы регионов.

   Правило простое: у каждой клетки проверяются ВСЕ четыре соседа, и если сосед — другой регион,
   вдоль этой стороны внутрь своей клетки рисуется полоса постоянной ширины. Границу рисуют обе
   соседние клетки, поэтому на общем стыке полосы смыкаются в ровную линию двойной ширины.

   Почему так. Раньше проверялись только правый и нижний сосед — и там, где граница проходила по
   левому/верхнему краю клетки, полосы не было вовсе (линия «прерывалась»). А излом шумом резал
   внутренний край полосы, из-за чего её ширина «плавала». Теперь шум только сдвигает полосу целиком
   (ширина неизменна), а стык непрерывен, потому что обе стороны берут один и тот же шум в одной точке.
   По воде и рекам границы не идут. */
export const borders = {
    // Крупный волнистый шум: значение зависит от положения пикселя, поэтому линия непрерывна.
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

    /* Полоса вдоль одной стороны клетки. dist — расстояние пикселя от стыка внутрь клетки (>=1),
       wobble — сдвиг внутреннего края шумом, width — толщина полосы. Пиксель у самого стыка (dist=1)
       всегда попадает в полосу, поэтому линия никогда не рвётся; гуляет только её внутренний край. */
    edgeBand(dist, wobble, width) {
        return dist >= 1 && dist <= width + wobble;
    },

    // Границы регионов: ровная полоса постоянной ширины вдоль всех сторон клетки.
    paintRegionBorders() {
        const { size, regionId } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const relief = this.reliefHeight;
        const ink = this.colors.regionBorder;
        const width = Math.max(2, this.px(2));    // толщина полосы в одну сторону
        const amp = Math.max(1, this.px(1));      // размах излома внутреннего края

        for (let tile = 0; tile < size * size; tile++) {
            const id = regionId[tile];
            if (id === -1) continue;
            const tx = tile % size, ty = Math.floor(tile / size);
            const left = tx > 0 ? regionId[tile - 1] : id;
            const right = tx < size - 1 ? regionId[tile + 1] : id;
            const up = ty > 0 ? regionId[tile - size] : id;
            const down = ty < size - 1 ? regionId[tile + size] : id;
            const eL = tx > 0 && left !== -1 && left !== id;
            const eR = tx < size - 1 && right !== -1 && right !== id;
            const eU = ty > 0 && up !== -1 && up !== id;
            const eD = ty < size - 1 && down !== -1 && down !== id;
            if (!eL && !eR && !eU && !eD) continue;

            const x0 = tx * T, y0 = ty * T;
            for (let oy = 0; oy < T; oy++) {
                const gy = y0 + oy;
                for (let ox = 0; ox < T; ox++) {
                    const gx = x0 + ox;
                    const k = gy * W + gx;
                    if (this.waterMask && this.waterMask[k]) continue;   // по воде границы не рисуем
                    if (this.riverMask && this.riverMask[k]) continue;   // и над реками

                    let inBand = false;
                    // Шум берём в точке стыка (одинаковой для обеих клеток), поэтому полосы смыкаются ровно.
                    if (eR) inBand = this.edgeBand(T - ox, (this.borderNoise((tx + 1) * T, gy) - 0.5) * 2 * amp, width);
                    if (!inBand && eL) inBand = this.edgeBand(ox + 1, (this.borderNoise(tx * T, gy) - 0.5) * 2 * amp, width);
                    if (!inBand && eD) inBand = this.edgeBand(T - oy, (this.borderNoise(gx, (ty + 1) * T) - 0.5) * 2 * amp, width);
                    if (!inBand && eU) inBand = this.edgeBand(oy + 1, (this.borderNoise(gx, ty * T) - 0.5) * 2 * amp, width);
                    if (!inBand) continue;

                    let alpha = 0.9;
                    if (relief) alpha *= 0.6 + 0.4 * (1 - Math.min(1, relief[k] / 110)); // в горах чуть слабее
                    pixels[k] = mixPacked(pixels[k], ink, alpha);
                }
            }
        }
    },
};
