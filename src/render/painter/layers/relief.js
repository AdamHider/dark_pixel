import { clamp } from '../../../core/math.js';
import { Terrain } from '../../../map/constants.js';
import { mixPacked, shadePacked } from '../../color.js';
import { BAYER } from '../constants.js';
import { LatticeNoise, hashUnit, tileHash } from '../noise.js';

/* Рельеф гор: карта высот, пики, снег на вершинах */

export const relief = {
    /* Горы — «карта высот», раскрашенная светотенью (свет слева сверху), а не спрайты. Высота клетки берётся из
       генератора, размывается по соседям и интерполируется до пикселя; к ней добавляются острые гребни (шум) и
       вершины-«конусы». Затем карта проецируется наклонно: чем выше точка, тем выше (севернее) она рисуется на
       экране — как у деревьев, которые показаны почти в профиль. Южные склоны при этом растягиваются и
       становятся видны «лицом» зрителю.
       Острота гор настраивается параметром peakSharpness (0 — округлые, 1 — острые). */

    // Карта высот гор по пикселям. От сезона не зависит, поэтому кэшируется.
    buildReliefHeights() {
        const map = this.map;
        const sharp = clamp(this.options.peakSharpness);
        const cache = this.reliefCache;
        if (cache && cache.source === map.mountainHeight && cache.tileSize === this.tileSize && cache.sharpness === sharp) return cache;

        const size = map.size;
        const T = this.tileSize;
        const W = this.width;
        const blurred = this.blurMountainHeights();
        const zone = this.tilesNearRelief(blurred);
        const height = new Uint8Array(W * W);
        const { first, second, fraction } = this.axis;
        const broad = new LatticeNoise(W, Math.max(6, this.px(34)), 501 + this.seedSalt);
        const fine = new LatticeNoise(W, Math.max(4, this.px(16)), 502 + this.seedSalt);
        const fine2 = new LatticeNoise(W, Math.max(3, this.px(9)), 504 + this.seedSalt);
        const warp = new LatticeNoise(W, Math.max(6, this.px(26)), 503 + this.seedSalt);
        const grain = new LatticeNoise(W, Math.max(3, this.px(6)), 505 + this.seedSalt);
        const crestWeight = 0.2 + 0.4 * sharp;   // насколько рельеф определяется гребнями
        const crestPower = 1 + 2.5 * sharp;        // чем больше, тем тоньше и острее гребни
        const powerTable = (power) => Float32Array.from({ length: 256 }, (_, n) => Math.pow(n / 255, power)); // x^power без Math.pow в цикле
        const coarseTable = powerTable(crestPower);
        const fineTable = powerTable(1 + 2 * sharp);
        const fineTable2 = powerTable(0.7 + 1.6 * sharp);
        const wrap = this.px(18);

        for (const tile of zone) {
            const tx = tile % size, ty = Math.floor(tile / size);
            for (let gy = ty * T; gy < (ty + 1) * T; gy++) {
                const rowTop = first[gy] * size, rowBottom = second[gy] * size, v = fraction[gy];
                for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                    const u = fraction[gx]; // линейная интерполяция: smoothstep делал из массива «кирпичную кладку»
                    const a = blurred[rowTop + first[gx]], b = blurred[rowTop + second[gx]];
                    const c = blurred[rowBottom + first[gx]], d = blurred[rowBottom + second[gx]];
                    const top = a + (b - a) * u;
                    const base = top + (c + (d - c) * u - top) * v;
                    if (base < 0.01) continue;

                    // Гребни — линии, где шум пересекает 0.5; шум «скручен» другим шумом, поэтому гребни извиваются, а не замыкаются в ячейки.
                    const shift = Math.round((warp.at(gx, gy) - 0.5) * wrap);
                    const wx = Math.min(W - 1, Math.max(0, gx + shift));
                    const wy = Math.min(W - 1, Math.max(0, gy - shift));
                    const crestA = coarseTable[Math.round((1 - Math.abs(2 * broad.at(wx, wy) - 1)) * 255)];
                    const crestB = fineTable[Math.round((1 - Math.abs(2 * fine.at(wx, wy) - 1)) * 255)];
                    const crestC = fineTable2[Math.round((1 - Math.abs(2 * fine2.at(wx, wy) - 1)) * 255)];
                    // Три масштаба гребней: крупные хребты, средние отроги и мелкая каменистая фактура.
                    const crest = 0.58 * crestA + 0.26 * crestB + 0.16 * crestC;
                    const rugged = 1 + (grain.at(gx, gy) - 0.5) * 0.28;   // неровности поверхности
                    const h = base * ((1 - crestWeight) + crestWeight * 1.7 * crest) * rugged;
                    height[gy * W + gx] = Math.round(clamp(h) * 255);
                }
            }
        }

        this.addPeaks(height, sharp);
        this.reliefCache = { source: map.mountainHeight, tileSize: T, sharpness: sharp, zone, height };
        return this.reliefCache;
    },

    // Острые вершины: у каждой от макушки расходятся 3–4 гребня; склоны по обе стороны гребня — плоские грани
    // (одна на свету, другая в тени). Круглые «конусы» давали кратеры, а гребни дают настоящие пики.
    addPeaks(height, sharp) {
        if (sharp <= 0.05) return;
        const { size, mountainHeight } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const armWidth = Math.max(3, this.px(7));

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const tileHeight = mountainHeight[y * size + x];
                if (tileHeight < 0.6) continue;
                if (hashUnit(x, y, 700 + this.seedSalt) > 0.3 + 0.4 * sharp) continue;

                const cx = x * T + T / 2 + (hashUnit(x, y, 701) - 0.5) * 0.5 * T;
                const cy = y * T + T / 2 + (hashUnit(x, y, 702) - 0.5) * 0.5 * T;
                const radius = this.px(12) + hashUnit(x, y, 703) * this.px(6);
                const radiusSq = radius * radius;
                const tip = Math.min(1, tileHeight * 1.2 + 0.12);

                const armCount = 3 + (tileHash(x, y, 704) % 2);
                const turn = hashUnit(x, y, 705) * Math.PI * 2;
                const armX = new Float32Array(armCount), armY = new Float32Array(armCount);
                for (let a = 0; a < armCount; a++) {
                    const angle = turn + a * 2 * Math.PI / armCount + (hashUnit(x, y, 710 + a) - 0.5) * 0.7;
                    armX[a] = Math.cos(angle);
                    armY[a] = Math.sin(angle);
                }

                const top = Math.max(0, Math.floor(cy - radius)), bottom = Math.min(W - 1, Math.ceil(cy + radius));
                const left = Math.max(0, Math.floor(cx - radius)), right = Math.min(W - 1, Math.ceil(cx + radius));
                for (let py = top; py <= bottom; py++) {
                    const dy = py - cy;
                    for (let px = left; px <= right; px++) {
                        const dx = px - cx;
                        if (dx * dx + dy * dy > radiusSq) continue;

                        let best = 0;
                        for (let a = 0; a < armCount; a++) {
                            const along = dx * armX[a] + dy * armY[a];
                            if (along < -armWidth * 0.5) continue;
                            const t = along <= 0 ? 0 : along / radius;
                            const across = Math.abs(dy * armX[a] - dx * armY[a]);
                            const value = (1 - t) * (1 - across / (armWidth * (1 - 0.55 * t)));
                            if (value > best) best = value;
                        }
                        if (best <= 0) continue;
                        const value = Math.round(Math.min(1, tip * 1.15) * (0.15 + 0.85 * best) * 255);
                        const k = py * W + px;
                        if (value > height[k]) height[k] = value;
                    }
                }
            }
        }
    },

    // Всё, что нужно для рисования рельефа в этом сезоне: тоны камня и снега, уровни снега, состояние проекции.
    prepareReliefRows() {
        const { zone, height } = this.relief;
        if (zone.length === 0) return null;

        const size = this.map.size;
        const W = this.width;
        const rows = Array.from({ length: size }, () => []);
        for (const tile of zone) rows[Math.floor(tile / size)].push(tile % size);

        const rock = this.packed.rock;
        const snow = this.packed.snow;
        const snowShade = this.packed.snowShade;
        const snowLevels = new Float32Array(size * size);
        for (const tile of zone) snowLevels[tile] = this.snowLevel(tile);

        return {
            rows,
            height,
            snowLevels,
            ramp: Int32Array.from([-0.3, -0.14, 0.05, 0.2, 0.34], amount => shadePacked(rock, amount)), // от тени к свету
            snowRamp: Int32Array.from([mixPacked(snowShade, rock, 0.3), snowShade, mixPacked(snow, snowShade, 0.5), snow, snow]),
            foothill: new Map(),                         // цвет земли -> цвет земли с проступающим камнем
            lift: this.px(this.options.mountainLift),
            proj: new Int32Array(W),                     // для каждого столбца: куда на экране попал предыдущий пиксель
            face: new Int32Array(W),                     // и каким цветом закрасить «склон» под ним
            valid: new Uint8Array(W)
        };
    },

    // Одна строка карты высот -> экран. Горы поднимаются вверх на lift * высота; пустоты между строками
    // (южные склоны) закрашиваются цветом склона.
    paintReliefRow(relief, gy) {
        const T = this.tileSize;
        const W = this.width;
        const size = this.map.size;
        const ty = Math.floor(gy / T);
        const { height, ramp, snowRamp, snowLevels, foothill, lift, proj, face, valid } = relief;
        const pixels = this.pixels;
        const last = W * W - 1;

        for (const tx of relief.rows[ty]) {
            const snowLevel = snowLevels[ty * size + tx];

            for (let gx = tx * T; gx < (tx + 1) * T; gx++) {
                const k = gy * W + gx;
                const raw = height[k];
                const h = raw / 255;
                const threshold = BAYER[(gy & 3) * 4 + (gx & 3)];
                let color = 0;
                let faceColor = 0;

                if (raw >= 41) {
                    // Свет падает слева сверху: склон, повёрнутый к северо-западу (юго-восток выше), светлый.
                    const northWest = k > W + 1 ? height[k - W - 1] : raw;
                    const southEast = k < last - W - 1 ? height[k + W + 1] : raw;
                    // Ложбины и ущелья: если пиксель ниже и западного, и восточного соседа — это дно складки, оно в тени.
                    const west = k > 0 ? height[k - 1] : raw;
                    const east = k < last ? height[k + 1] : raw;
                    const crease = ((west + east) * 0.5 - raw) * (3 / 255);
                    let tone = Math.round(2 + (southEast - northWest) * (20 / 255) + (h - 0.45) * 2.6
                        + (threshold - 0.5) * 0.35 - Math.min(1.3, Math.max(0, crease)));
                    tone = tone < 0 ? 0 : tone > 4 ? 4 : tone;

                    const palette = h + (threshold - 0.5) * 0.08 > snowLevel ? snowRamp : ramp;
                    color = palette[tone];
                    faceColor = palette[tone > 0 ? tone - 1 : 0]; // южные склоны на свету бывают реже: делаем темнее
                } else if (raw >= 13 && threshold < (h - 0.05) / 0.11) {   // предгорья: камень «прорастает» сквозь землю
                    const ground = pixels[k];
                    let mixed = foothill.get(ground);
                    if (mixed === undefined) foothill.set(ground, mixed = mixPacked(ground, ramp[1], 0.65));
                    color = faceColor = mixed;
                }

                if (color === 0) {                  // здесь земля: закрываем склон, оставшийся над ней
                    if (valid[gx]) {
                        this.fillColumn(gx, proj[gx] + 1, gy - 1, face[gx]);
                        valid[gx] = 0;
                    }
                    continue;
                }

                const lifted = gy - Math.round(h * lift);
                if (valid[gx] && lifted - proj[gx] > 1) this.fillColumn(gx, proj[gx] + 1, lifted - 1, faceColor);
                if (lifted >= 0) pixels[lifted * W + gx] = color;
                proj[gx] = lifted;
                face[gx] = faceColor;
                valid[gx] = 1;
            }
        }
    },

    fillColumn(gx, fromY, toY, color) {
        const W = this.width;
        for (let y = Math.max(0, fromY); y <= toY; y++) this.pixels[y * W + gx] = color;
    },

    // Высоты клеток, дважды размытые по соседям: горы «набухают» за пределы своих клеток, а разброс высот
    // от клетки к клетке сглаживается (иначе на массиве проступает сетка).
    blurMountainHeights() {
        const size = this.map.size;
        const pass = source => {
            const out = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let sum = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && ny >= 0 && nx < size && ny < size) sum += source[ny * size + nx];
                        }
                    }
                    out[y * size + x] = sum / 9;
                }
            }
            return out;
        };
        const blurred = pass(pass(this.map.mountainHeight));
        for (let i = 0; i < blurred.length; i++) blurred[i] = Math.min(1, blurred[i] * 1.8);
        return blurred;
    },

    // Клетки, на которых может быть рельеф: сами горы и всё, что рядом.
    tilesNearRelief(blurred) {
        const size = this.map.size;
        const zone = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let near = false;
                for (let dy = -1; dy <= 1 && !near; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < size && ny < size && blurred[ny * size + nx] > 0) { near = true; break; }
                    }
                }
                if (near) zone.push(y * size + x);
            }
        }
        return zone;
    },

    // С какой относительной высоты лежит снег: чем холоднее (с учётом сезона), тем он ниже.
    snowLevel(tile) {
        const fraction = clamp((0.36 - this.seasonalTemperature(tile)) / 0.3);
        return 0.95 - fraction * 0.6;
    },

    // На сколько пикселей поднята поверхность гор в центре клетки (руда и разломы лежат на ней, а не под ней).
    liftAtTile(x, y) {
        if (!this.reliefHeight || this.map.terrain[this.map.index(x, y)] !== Terrain.MOUNTAIN) return 0;
        const T = this.tileSize;
        const k = (y * T + (T >> 1)) * this.width + x * T + (T >> 1);
        return Math.round(this.reliefHeight[k] / 255 * this.px(this.options.mountainLift));
    },
};
