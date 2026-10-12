import { ROAD_DIRECTIONS } from '../../../map/constants.js';
import { mixPacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Дороги между поселениями */

export const roads = {
    roadWidth(level) {
        return Math.max(1, this.px([2, 3, 4][Math.min(3, Math.max(1, level)) - 1]));
    },

    /* Дороги строит генератор (map.roadLinks: из каждой клетки — в какие из 8 сторон идёт дорога, map.roadLevel — насколько
       она наезжена). Здесь каждый отрезок между центрами соседних клеток рисуется слегка извилистой полосой:
       центр клетки смещён случайно, середина отрезка тоже. Сначала мягкая полоса утоптанной земли, потом сама дорога. */
    paintRoads() {
        const map = this.map;
        if (!this.options.roads || !map.roadLinks) return;

        const geometry = this.buildRoadGeometry();
        const c = this.colors;
        const dirt = this.moodize(c.dirt), light = this.moodize(c.dirtLight), mud = this.moodize(c.mud);
        const kinds = [dirt, light, mud];
        const W = this.width;
        const size = map.size;
        const T = this.tileSize;
        const pixels = this.pixels;
        const tileOf = k => Math.floor(Math.floor(k / W) / T) * size + Math.floor((k % W) / T);

        for (const k of geometry.halo) pixels[k] = mixPacked(pixels[k], dirt, 0.28);
        for (let n = 0; n < geometry.core.length; n++) {
            const k = geometry.core[n];
            let color = kinds[geometry.kind[n]];
            const snow = this.snowCoverage(tileOf(k));
            if (snow > 0) color = mixPacked(color, this.packed.snow, 0.75 * snow);
            pixels[k] = color;
        }
    },

    // Пиксели дорог (не зависят от сезона): мягкая полоса утоптанной земли и сама дорога с тремя оттенками.
    buildRoadGeometry() {
        const map = this.map;
        const key = [this.tileSize, this.seedSalt].join('|');
        const cache = this.roadCache;
        if (cache && cache.source === map.roadLinks && cache.key === key && cache.riverMask === this.riverMask) return cache;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const relief = this.reliefHeight;
        const wobble = this.px(2);
        const halo = new Set();
        const core = new Map();

        const centerOf = (x, y) => [
            x * T + T / 2 + (hashUnit(x, y, 980) - 0.5) * wobble,
            y * T + T / 2 + (hashUnit(x, y, 981) - 0.5) * wobble
        ];
        const stamp = (cx, cy, width, isHalo) => {
            for (let oy = 0; oy < width; oy++) {
                for (let ox = 0; ox < width; ox++) {
                    const x = cx + ox - (width >> 1), y = cy + oy - (width >> 1);
                    if (x < 0 || y < 0 || x >= W || y >= W) continue;
                    const k = y * W + x;
                    if (this.waterMask[k] || (this.riverMask && this.riverMask[k]) || (relief && relief[k] > 40)) continue;
                    if (isHalo) { halo.add(k); continue; }
                    const r = hashUnit(x, y, 975);
                    core.set(k, r < 0.2 ? 1 : r < 0.45 ? 2 : 0);
                }
            }
        };

        for (let i = 0; i < size * size; i++) {
            const links = map.roadLinks[i];
            if (!links) continue;
            const x = i % size, y = Math.floor(i / size);
            const [ax, ay] = centerOf(x, y);
            let count = 0;

            for (let d = 0; d < 8; d++) {
                if (!(links & (1 << d))) continue;
                count++;
                const [dx, dy] = ROAD_DIRECTIONS[d];
                const j = (y + dy) * size + x + dx;
                if (j < i) continue;                                          // каждый отрезок рисуем один раз

                const [bx, by] = centerOf(x + dx, y + dy);
                const bend = (hashUnit(i, j, 982) - 0.5) * wobble * 1.6;       // середина отрезка уходит в сторону
                const length = Math.hypot(bx - ax, by - ay) || 1;
                const mx = (ax + bx) / 2 - ((by - ay) / length) * bend;
                const my = (ay + by) / 2 + ((bx - ax) / length) * bend;
                const width = this.roadWidth(Math.min(map.roadLevel[i], map.roadLevel[j]));
                const points = [
                    ...this.linePoints(Math.round(ax), Math.round(ay), Math.round(mx), Math.round(my)),
                    ...this.linePoints(Math.round(mx), Math.round(my), Math.round(bx), Math.round(by))
                ];
                for (const [px, py] of points) stamp(px, py, width + 2, true);
                for (const [px, py] of points) stamp(px, py, width, false);
            }
            if (count !== 2) stamp(Math.round(ax), Math.round(ay), this.roadWidth(map.roadLevel[i]) + 1, false);   // перекрёсток или конец дороги
        }
        for (const k of core.keys()) halo.delete(k);

        this.roadCache = { source: map.roadLinks, key, riverMask: this.riverMask, halo: Int32Array.from(halo), core: Int32Array.from(core.keys()), kind: Uint8Array.from(core.values()) };
        return this.roadCache;
    },
};
