import { mixPacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Границы фракций.

   Фракция — это группа соседних регионов. Границу рисуем там, где у соседних клеток разные фракции: каждая
   сторона такой клетки получает цвет своей фракции, поэтому линия сразу показывает, чья земля за ней.
   Кромка плотная (без дизеринга) и достаточно широкая, чтобы границу было хорошо видно; край изрезан крупным
   шумом, чтобы линия не выглядела «по сетке». Границы бывают только на суше — по воде и рекам не идут. */
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
        const radius = Math.max(3, this.px(6));   // граница фракции — самая широкая и заметная

        for (let tile = 0; tile < size * size; tile++) {
            const id = factionId[tile];
            if (id < 0) continue;
            const tx = tile % size, ty = Math.floor(tile / size);
            const right = tx < size - 1 ? factionId[tile + 1] : id;
            const below = ty < size - 1 ? factionId[tile + size] : id;
            const edgeRight = tx < size - 1 && right >= 0 && right !== id;
            const edgeBelow = ty < size - 1 && below >= 0 && below !== id;
            if (!edgeRight && !edgeBelow) continue;

            const color = this.factionColor(id);
            const x0 = tx * T, y0 = ty * T;
            for (let oy = 0; oy < T; oy++) {
                const gy = y0 + oy;
                for (let ox = 0; ox < T; ox++) {
                    const gx = x0 + ox;
                    const k = gy * W + gx;
                    if (this.waterMask && this.waterMask[k]) continue;    // фракции только на суше
                    if (this.riverMask && this.riverMask[k]) continue;    // и над реками

                    const toRight = edgeRight ? T - ox : Infinity;
                    const toBottom = edgeBelow ? T - oy : Infinity;
                    const dist = Math.min(toRight, toBottom);
                    if (dist > radius) continue;

                    const d = dist - this.factionNoise(gx, gy) * radius;
                    if (d >= radius || d <= 0) continue;
                    /* Кромка двухслойная: тёмная обводка снаружи (чтобы граница читалась на любом рельефе)
                       и плотная цветная полоса ближе к своей земле. */
                    const status = this.diplomacyColor(id, edgeRight ? right : below);
                    pixels[k] = mixPacked(pixels[k], ink, 0.9);
                    pixels[k] = mixPacked(pixels[k], status || color, 0.85);
                }
            }
        }
    },

    // Ключ пары фракций, одинаковый при любом порядке (как в GameState.relationKey).
    relationKey(a, b) {
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    },

    // Цвет дип. статуса пары фракций (или null, если отношение нейтрально).
    diplomacyColor(a, b) {
        if (!this.relations) return null;
        const level = this.relations.get(this.relationKey(a, b));
        if (level === 'war') return this.colors.factionWar;
        if (level === 'ally') return this.colors.factionAlly;
        if (level === 'neutral') return this.colors.factionNeutral;
        return null;
    },
};
