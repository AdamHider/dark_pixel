import { mixPacked, packRgb } from '../../color.js';

/* Достижимая зона отряда — запекается прямо в буфер карты, клетка за клеткой.

   Важно: это слой карты, а не экранная подсветка. Раньше зона рисовалась полупрозрачными
   прямоугольниками поверх холста в экранных координатах, поэтому «плавала» при скролле/зуме и не
   совпадала с клетками. Теперь цвет меняется у самих пикселей клетки (непрозрачно, до цветокоррекции),
   и зона привязана к сетке карты — как границы регионов. Сами маркеры отрядов остаются спрайтами
   поверх карты (src/render/renderer/armies.js), потому что они выходят за пределы клетки. */

const REACH = packRgb(255, 226, 122);
const REACH_MIX = 0.28;    // насколько сильно подсвечиваем достижимые клетки
const ZOC = packRgb(192, 57, 43);
const ZOC_MIX = 0.45;      // насколько плотно красим линию зоны контроля

export const armyOverlay = {
    // reachable — Set индексов клеток, zoc — Set индексов зоны контроля, size — сторона карты в клетках.
    paintArmyOverlay(reachable, zoc, size) {
        if ((!reachable || reachable.size === 0) && (!zoc || zoc.size === 0)) return;
        const T = this.tileSize;
        const W = this.width;
        const pixels = this.pixels;

        if (reachable) {
            for (const tile of reachable) {
                const tx = tile % size, ty = Math.floor(tile / size);
                const x0 = tx * T, y0 = ty * T;
                for (let oy = 0; oy < T; oy++) {
                    const row = (y0 + oy) * W;
                    for (let ox = 0; ox < T; ox++) {
                        const k = row + x0 + ox;
                        pixels[k] = mixPacked(pixels[k], REACH, REACH_MIX);
                    }
                }
            }
        }

        // Зона контроля: плотная полоса по краю, который граничит с клеткой вне зоны (единая линия по сетке).
        if (zoc) {
            for (const tile of zoc) {
                const tx = tile % size, ty = Math.floor(tile / size);
                const x0 = tx * T, y0 = ty * T;
                this.overlayEdge(tx > 0 && zoc.has(tile - 1), x0, y0, T, W, 0, ZOC, ZOC_MIX);                       // левый край
                this.overlayEdge(tx < size - 1 && zoc.has(tile + 1), x0 + T - 1, y0, T, W, 0, ZOC, ZOC_MIX);      // правый край
                this.overlayEdge(ty > 0 && zoc.has(tile - size), x0, y0, T, W, 1, ZOC, ZOC_MIX);                  // верхний край
                this.overlayEdge(ty < size - 1 && zoc.has(tile + size), x0, y0 + T - 1, T, W, 1, ZOC, ZOC_MIX);  // нижний край
            }
        }
    },

    // Полоса вдоль одной стороны клетки, если за ней зоны нет (внутренние стыки не обводим).
    overlayEdge(neighborInside, x0, y0, T, W, axis, color, amount) {
        if (neighborInside) return;
        const pixels = this.pixels;
        for (let p = 0; p < T; p++) {
            const k = axis === 0 ? (y0 + p) * W + x0 : y0 * W + x0 + p;
            pixels[k] = mixPacked(pixels[k], color, amount);
        }
    },
};
