import { clamp } from '../../../core/math.js';
import { Shore } from '../../../map/constants.js';
import { mixPacked, shadePacked } from '../../color.js';
import { BAYER, RIVER_ICE_TEMPERATURE } from '../constants.js';
import { hashUnit } from '../noise.js';

/* Реки с мягкой кромкой, мосты и броды */

export const rivers = {
    // Ширина реки в пикселях по её уровню (глубине).
    // Ширина реки в клетке по количеству воды: ручей — 2–3 пикселя, большая река у устья — до 14.
    riverWidthAt(i) {
        const flow = this.map.riverFlow[i];
        return Math.max(2, Math.min(this.px(14), Math.round((this.tileSize / 12) * (1 + 0.4 * Math.sqrt(flow)))));
    },

    riverWidth(level) {
        return Math.max(level + 1, this.px([4, 6, 8][level - 1]));
    },

    // Смещение полосы толщиной thickness, чтобы она лежала по центру клетки.
    band(thickness) {
        return Math.round((this.tileSize - thickness) / 2);
    },

    /* Реки рисуем прямо в пиксели фона (а не поверх готовой картинки), чтобы у них была такая же мягкая
       «пиксельная» кромка, как у биомов и берега.
       Сначала строим маску: в каждом пикселе — уровень реки (1..3) или 0. Потом красим её и растушёвываем края дизерингом. */
    paintRivers() {
        const geometry = this.buildRiverGeometry();
        this.riverMask = geometry.mask;
        if (geometry.riverTiles.length === 0) return;

        const { mask, queue, distance, levelNear, solid } = geometry;
        const T = this.tileSize;
        const W = this.width;
        const size = this.map.size;
        const pixels = this.pixels;
        const edgeWidth = Math.max(2, T / this.options.coastSharpness);
        const tileOf = k => Math.floor(Math.floor(k / W) / T) * size + Math.floor((k % W) / T);
        const iceRiver = tile => this.seasonalTemperature(tile) < RIVER_ICE_TEMPERATURE;
        const reachPx = Math.ceil(edgeWidth / 2) + 1;

        for (const k of solid) {                                   // сердцевина реки — сплошной цвет
            const shades = iceRiver(tileOf(k)) ? this.packed.ice : this.packed.riverShades;
            pixels[k] = shades[mask[k] - 1];
        }
        for (const k of queue) {                                   // кромка: дизеринг по расстоянию до края
            const d = distance[k];
            const xx = k % W, yy = (k - xx) / W;
            const shades = iceRiver(tileOf(k)) ? this.packed.ice : this.packed.riverShades;
            const level = levelNear[k];
            const threshold = BAYER[(yy & 3) * 4 + (xx & 3)];

            if (d > 0) {
                const soft = Math.min(edgeWidth, this.riverWidth(level));
                if (threshold < clamp(0.5 + (d - 0.5) / soft)) pixels[k] = shades[level - 1];
            } else {
                const outside = -d;
                if (threshold < clamp(0.5 - (outside - 0.5) / edgeWidth)) pixels[k] = shades[level - 1];
                else if (this.options.shores) this.paintBankPixel(xx, yy, k, outside, reachPx);
            }
        }
    },

    /* Форма рек не зависит от сезона, поэтому считается один раз: маска (уровень реки в каждом пикселе), список
       пикселей кромки с расстоянием до края и список «сердцевины». Кэш сбрасывается при смене карты или параметров резкости. */
    buildRiverGeometry() {
        const map = this.map;
        const key = [this.tileSize, this.options.coastSharpness, this.options.blendSharpness, this.options.roundCoast, this.seedSalt].join('|');
        const cache = this.riverCache;
        if (cache && cache.source === map.river && cache.key === key) return cache;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const mask = new Uint8Array(W * W);

        const riverTiles = [];
        for (let i = 0; i < map.river.length; i++) {
            if (map.river[i] > 0) riverTiles.push(i);
        }
        const empty = { source: map.river, key, riverTiles, mask, queue: new Int32Array(0), distance: null, levelNear: null, solid: new Int32Array(0) };
        if (riverTiles.length === 0) {
            this.riverCache = empty;
            return empty;
        }

        // 1) форма: каждая клетка реки соединена с клеткой, куда течёт вода (map.riverTo). Отрезок — слегка извилистая полоса,
        //    ширина которой плавно меняется от клетки к клетке по количеству воды (map.riverFlow); у устья река расширяется.
        const wobble = this.px(2);
        const centerOf = tile => {
            const x = tile % size, y = Math.floor(tile / size);
            return [x * T + T / 2 + (hashUnit(x, y, 983) - 0.5) * wobble, y * T + T / 2 + (hashUnit(x, y, 984) - 0.5) * wobble];
        };
        const stamp = (cx, cy, width, level) => {
            const radius = width / 2;
            for (let oy = -Math.ceil(radius); oy <= Math.ceil(radius); oy++) {
                for (let ox = -Math.ceil(radius); ox <= Math.ceil(radius); ox++) {
                    if (ox * ox + oy * oy > radius * radius + 0.25) continue;     // круглое «перо», а не квадрат
                    const x = cx + ox, y = cy + oy;
                    if (x < 0 || y < 0 || x >= W || y >= W) continue;
                    const k = y * W + x;
                    if (!this.waterMask[k] && level > mask[k]) mask[k] = level;
                }
            }
        };

        for (const i of riverTiles) {
            const to = map.riverTo[i];
            if (to === -1) continue;
            const [ax, ay] = centerOf(i);
            let [bx, by] = centerOf(to);
            const toWater = !map.isLand(to);
            if (toWater) { bx = (ax + bx) / 2; by = (ay + by) / 2; }              // в море река заканчивается у берега
            const widthFrom = this.riverWidthAt(i);
            const widthTo = toWater ? Math.round(widthFrom * 1.4) : (map.river[to] > 0 ? this.riverWidthAt(to) : widthFrom);

            const length = Math.hypot(bx - ax, by - ay) || 1;
            const bend = (hashUnit(i, to, 985) - 0.5) * Math.min(this.px(5), length * 0.8);
            const mx = (ax + bx) / 2 - ((by - ay) / length) * bend;
            const my = (ay + by) / 2 + ((bx - ax) / length) * bend;
            const points = [
                ...this.linePoints(Math.round(ax), Math.round(ay), Math.round(mx), Math.round(my)),
                ...this.linePoints(Math.round(mx), Math.round(my), Math.round(bx), Math.round(by))
            ];
            const level = map.river[i];
            points.forEach(([px, py], k) => stamp(px, py, widthFrom + (widthTo - widthFrom) * (k / Math.max(1, points.length - 1)), level));
        }

        // 2) расстояние до края реки: внутри — положительное, снаружи — отрицательное; ширина перехода из coastSharpness
        const edgeWidth = Math.max(2, T / this.options.coastSharpness);
        const reachPx = Math.ceil(edgeWidth / 2) + 1;
        const distance = new Int8Array(W * W);
        const levelNear = new Uint8Array(W * W);
        const queue = [];
        const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= W ? 0 : mask[yy * W + xx]);

        // Клетки, где может быть вода реки: сами реки и их соседи. Каждый пиксель — один раз.
        const zone = new Set();
        for (const i of riverTiles) {
            zone.add(i);
            for (const near of map.neighbors8(i)) zone.add(near);
        }
        const zoneTiles = [...zone];

        for (const i of zoneTiles) {
            const x0 = (i % size) * T;
            const y0 = Math.floor(i / size) * T;
            for (let yy = y0; yy < y0 + T; yy++) {
                for (let xx = x0; xx < x0 + T; xx++) {
                    const k = yy * W + xx;
                    const around = Math.max(at(xx - 1, yy), at(xx + 1, yy), at(xx, yy - 1), at(xx, yy + 1));
                    if (mask[k] > 0 && (at(xx - 1, yy) === 0 || at(xx + 1, yy) === 0 || at(xx, yy - 1) === 0 || at(xx, yy + 1) === 0)) {
                        distance[k] = 1;                       // последний пиксель реки у края
                        levelNear[k] = mask[k];
                        queue.push(k);
                    } else if (mask[k] === 0 && around > 0) {
                        distance[k] = -1;                      // первый пиксель суши у воды
                        levelNear[k] = around;
                        queue.push(k);
                    }
                }
            }
        }
        for (let head = 0; head < queue.length; head++) {          // волна от края внутрь реки и наружу на сушу
            const k = queue[head];
            const d = distance[k];
            const sign = d > 0 ? 1 : -1;
            if (Math.abs(d) >= reachPx) continue;
            const x = k % W, y = (k - x) / W;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
                const next = ny * W + nx;
                if (distance[next] !== 0 || (mask[next] > 0) !== (sign > 0)) continue;
                distance[next] = d + sign;
                levelNear[next] = levelNear[k];
                queue.push(next);
            }
        }

        const solid = [];
        for (const i of zoneTiles) {
            const x0 = (i % size) * T, y0 = Math.floor(i / size) * T;
            for (let yy = y0; yy < y0 + T; yy++) {
                for (let xx = x0; xx < x0 + T; xx++) {
                    const k = yy * W + xx;
                    if (mask[k] > 0 && distance[k] === 0) solid.push(k);
                }
            }
        }

        this.riverCache = { source: map.river, key, riverTiles, mask, queue: Int32Array.from(queue), distance, levelNear, solid: Int32Array.from(solid) };
        return this.riverCache;
    },

    // Берег реки: у пляжных клеток песок, у каменистых галька, иначе — тёмная мокрая земля. Чем дальше от воды, тем реже.
    paintBankPixel(xx, yy, k, outside, reachPx) {
        if (this.waterMask[k]) return;
        const chance = 0.9 * (1 - (outside - 1) / reachPx);
        if (hashUnit(xx, yy, 631) >= chance) return;

        const T = this.tileSize;
        const tile = Math.floor(yy / T) * this.map.size + Math.floor(xx / T);
        const type = this.map.shore[tile];
        const c = this.colors;
        const close = outside <= 1;

        if (type === Shore.BEACH) {
            this.pixels[k] = close ? c.wetSand : c.sand;
        } else if (type === Shore.ROCKY || type === Shore.CLIFF) {
            const r = hashUnit(xx, yy, 630);
            this.pixels[k] = r < 0.35 ? c.pebbleLight : r < 0.7 ? c.pebbleDark : mixPacked(this.pixels[k], c.stoneMid, 0.4);
        } else {
            this.pixels[k] = shadePacked(this.pixels[k], close ? -0.22 : -0.1);
        }
    },

    // Переправа: каменный мост (река глубже 1) или брод из камней (ручей). Рисуется поперёк течения.
    // Длину и центр берём по настоящим пикселям реки в клетке, поэтому мост всегда лежит от берега до берега.
    paintCrossing(x, y, i) {
        const map = this.map;
        const T = this.tileSize;
        const W = this.width;
        const c = this.colors;
        const mask = this.riverMask;
        const to = map.riverTo[i];
        const flowX = to === -1 ? 0 : (to % map.size) - x;
        const flowY = to === -1 ? 0 : Math.floor(to / map.size) - y;
        const horizontalFlow = to === -1
            ? x > 0 && x < map.size - 1 && map.river[i - 1] > 0 && map.river[i + 1] > 0
            : Math.abs(flowX) >= Math.abs(flowY);

        // Границы русла в клетке: «вдоль» течения и «поперёк».
        const left = x * T, top = y * T;
        let minAcross = Infinity, maxAcross = -Infinity, sumAlong = 0, count = 0;
        if (mask) {
            for (let gy = top; gy < top + T; gy++) {
                for (let gx = left; gx < left + T; gx++) {
                    if (!mask[gy * W + gx]) continue;
                    const along = horizontalFlow ? gx : gy;
                    const across = horizontalFlow ? gy : gx;
                    if (across < minAcross) minAcross = across;
                    if (across > maxAcross) maxAcross = across;
                    sumAlong += along;
                    count++;
                }
            }
        }
        const middle = Math.floor(T / 2);
        if (count === 0) {                                   // маски нет — считаем по ширине реки
            const center = (horizontalFlow ? top : left) + middle;
            minAcross = center - this.riverWidthAt(i) / 2;
            maxAcross = center + this.riverWidthAt(i) / 2;
            sumAlong = (horizontalFlow ? left : top) + middle;
            count = 1;
        }

        // Работаем в координатах «вдоль течения» (a) и «поперёк течения» (b), затем переводим в x, y.
        const put = (a, b, w, h, color) => (horizontalFlow
            ? this.rect(a, b, w, h, color)
            : this.rect(b, a, h, w, color));
        const bank = Math.max(1, this.px(2));                 // насколько мост заходит на берег
        const centerAlong = Math.round(sumAlong / count);
        const acrossFrom = Math.round(minAcross) - bank;
        const acrossTo = Math.round(maxAcross) + bank;
        const span = acrossTo - acrossFrom + 1;

        if (map.crossing[i] === 2) {
            const thickness = this.px(5);
            const a0 = centerAlong - (thickness >> 1);
            put(a0, acrossFrom, thickness, span, c.bridgeDeck);
            put(a0, acrossFrom, 1, span, c.bridgeEdge);
            put(a0 + thickness - 1, acrossFrom, 1, span, c.bridgeEdge);
        } else {
            const stones = Math.max(2, Math.min(5, Math.round(span / this.px(3))));
            for (let k = 0; k < stones; k++) {
                const b = acrossFrom + Math.round(k * (span - 2) / (stones - 1));
                put(centerAlong - 1, b, 2, 2, c.stone);
                put(centerAlong, b + 1, 1, 1, c.stoneShadow);
            }
        }
    },
};
