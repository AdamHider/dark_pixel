import { pairKey } from '../../../core/pairs.js';
import { mixPacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Границы фракций.

   Фракция — это группа соседних регионов. Границу рисуем там, где у соседних клеток разные фракции:
   у каждой клетки проверяются ВСЕ четыре соседа, и вдоль стороны с чужой фракцией внутрь своей клетки
   идёт полоса постоянной ширины. Сосед рисует такую же полосу со своей стороны, поэтому линия на стыке
   ровная и непрерывная (двойной ширины).

   Кромка двухслойная и читается одинаково с обеих сторон: у самого стыка (внешняя половина) — цвет
   дип. статуса с соседом, ближе к своей земле (внутренняя половина) — цвет фракции. Итог на общей
   границе: цвет фракции A | полоса статуса | цвет фракции B.

   Владения бывают только на суше, поэтому по воде и рекам границы не идут. */
export const factions = {
    factionNoise(gx, gy) {
        const cell = Math.max(8, this.px(20));
        const fx = gx / cell, fy = gy / cell;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const u = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const v = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const a = hashUnit(ix, iy, 1701), b = hashUnit(ix + 1, iy, 1701);
        const c = hashUnit(ix, iy + 1, 1701), d = hashUnit(ix + 1, iy + 1, 1701);
        const top = a + (b - a) * u;
        return top + (c + (d - c) * u - top) * v;
    },

    paintFactionBorders() {
        const { size, factionId } = this.map;
        if (!factionId) return;

        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;
        const ink = this.colors.factionBorder;
        const width = Math.max(3, this.px(3));    // полоса внутрь своей клетки (общая линия — двойной ширины)
        const half = width / 2;                    // внешняя (статус) и внутренняя (фракция) половины
        const amp = width * 0.5;

        for (let tile = 0; tile < size * size; tile++) {
            const id = factionId[tile];
            if (id < 0) continue;
            const tx = tile % size, ty = Math.floor(tile / size);
            const left = tx > 0 ? factionId[tile - 1] : id;
            const right = tx < size - 1 ? factionId[tile + 1] : id;
            const up = ty > 0 ? factionId[tile - size] : id;
            const down = ty < size - 1 ? factionId[tile + size] : id;
            const eL = tx > 0 && left >= 0 && left !== id;
            const eR = tx < size - 1 && right >= 0 && right !== id;
            const eU = ty > 0 && up >= 0 && up !== id;
            const eD = ty < size - 1 && down >= 0 && down !== id;
            if (!eL && !eR && !eU && !eD) continue;

            const color = this.factionColor(id);
            const x0 = tx * T, y0 = ty * T;
            for (let oy = 0; oy < T; oy++) {
                const gy = y0 + oy;
                for (let ox = 0; ox < T; ox++) {
                    const gx = x0 + ox;
                    const k = gy * W + gx;
                    if (this.waterMask && this.waterMask[k]) continue;
                    if (this.riverMask && this.riverMask[k]) continue;

                    let t = -1, status = null;
                    if (eR) { t = (T - ox) - (this.factionNoise((tx + 1) * T, gy) - 0.5) * 2 * amp; status = this.diplomacyColor(id, right); }
                    if ((t < 1 || t > width + amp) && eL) { t = (ox + 1) - (this.factionNoise(tx * T, gy) - 0.5) * 2 * amp; status = this.diplomacyColor(id, left); }
                    if ((t < 1 || t > width + amp) && eD) { t = (T - oy) - (this.factionNoise(gx, (ty + 1) * T) - 0.5) * 2 * amp; status = this.diplomacyColor(id, down); }
                    if ((t < 1 || t > width + amp) && eU) { t = (oy + 1) - (this.factionNoise(gx, ty * T) - 0.5) * 2 * amp; status = this.diplomacyColor(id, up); }
                    if (t < 1 || t > width + amp) continue;

                    /* Двухслойная кромка: у самого стыка (t <= half) — плотная тёмная обводка, поверх которой
                       идёт цвет дип. статуса; ближе к своей земле — плотный цвет фракции. Сосед рисует такую же
                       кромку со своей стороны, поэтому на общей границе полосы смыкаются без разрывов. */
                    if (t <= half) {
                        pixels[k] = mixPacked(pixels[k], ink, 0.9);
                        pixels[k] = mixPacked(pixels[k], status || color, 0.6);
                    } else {
                        pixels[k] = mixPacked(pixels[k], color, 0.92);
                    }
                }
            }
        }
    },

    // Цвет дип. статуса пары фракций (или null, если отношение нейтрально).
    diplomacyColor(a, b) {
        if (!this.relations) return null;
        const level = this.relations.get(pairKey(a, b));
        if (level === 'war') return this.colors.factionWar;
        if (level === 'ally') return this.colors.factionAlly;
        if (level === 'neutral') return this.colors.factionNeutral;
        return null;
    },
};
