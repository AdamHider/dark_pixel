import { clamp } from '../../../core/math.js';
import { ROAD_DIRECTIONS } from '../../../map/constants.js';
import { BLACK, mixPacked, packRgb, shadePacked } from '../../color.js';
import { hashUnit } from '../noise.js';
import { PixelBuffer } from '../pixel-buffer.js';

/* Поселения: раскладка домиков, земля под ними, сами дома */

export const settlements = {
    /* Поселение — ресурс клетки. Каждая клетка с поселением рисуется 1–4 домиками (число зависит от её уровня) и
       не выходит за свои границы (допуск settlementOverflow, по умолчанию 25%): так по рисунку всегда понятно, в какой
       клетке поселение. Крупные населённые пункты получаются из групп соседних клеток (их ставит генератор): у каждой
       свой уровень, между ними идут дорожки, а в центре самого большого города стоит каменная часовня.
       Раскладка не зависит от сезона и считается один раз. */
    settlementLayout(x, y, i) {
        const map = this.map;
        const cache = this.settlementLayoutCache;
        if (!cache || cache.source !== map.population || cache.tileSize !== this.tileSize || cache.salt !== this.seedSalt) {
            this.settlementLayoutCache = { source: map.population, tileSize: this.tileSize, salt: this.seedSalt, layouts: new Map() };
        }
        const layouts = this.settlementLayoutCache.layouts;
        if (!layouts.has(i)) layouts.set(i, this.layoutSettlement(x, y, i));
        return layouts.get(i);
    },

    layoutSettlement(x, y, i) {
        const map = this.map;
        const o = this.options;
        const T = this.tileSize;
        const W = this.width;
        const level = map.settlementLevel[i] || 1;
        const maxLevel = (map.options && map.options.settlementMaxLevel) || 4;
        const rnd = n => hashUnit(x, y, 1000 + n);

        // Сколько домиков: от settlementMinHouses (уровень 1) до settlementMaxHouses (высший уровень).
        const share = (level - 1) / Math.max(1, maxLevel - 1);
        const count = clamp(Math.round(o.settlementMinHouses + share * (o.settlementMaxHouses - o.settlementMinHouses)),
            o.settlementMinHouses, o.settlementMaxHouses);

        const left = x * T, top = y * T;
        const slack = Math.round(T * o.settlementOverflow);       // насколько основание дома может выйти за клетку
        const usable = (px, py) => {
            if (px < 0 || py < 0 || px >= W || py >= W) return false;
            const k = py * W + px;
            return !this.waterMask[k] && !(this.riverMask && this.riverMask[k]) && !(this.reliefHeight && this.reliefHeight[k] > 40);
        };
        const occupied = new Set();
        const houses = [];
        const tryPlace = (centerX, baseY, w, bodyH, roofH, kind) => {
            const houseLeft = Math.round(centerX - w / 2);
            const base = Math.round(baseY);
            const bodyTop = base - bodyH;
            // Основание (стены) остаётся в клетке с допуском; крыша может уходить вверх — это перспектива, а не площадь.
            if (houseLeft < left - slack || houseLeft + w > left + T + slack || base > top + T + slack || bodyTop < top - slack) return false;
            for (let yy = bodyTop - roofH; yy <= base; yy++) {            // точный след дома, без полей: в клетке надо уместить до 4 домов
                for (let xx = houseLeft; xx < houseLeft + w; xx++) {
                    if (!usable(xx, yy) || occupied.has(yy * W + xx)) return false;
                }
            }
            for (let yy = bodyTop - roofH; yy <= base; yy++) {
                for (let xx = houseLeft; xx < houseLeft + w; xx++) occupied.add(yy * W + xx);
            }
            houses.push({ x: houseLeft + (w >> 1), base, w, bodyH, roofH, kind, roll: rnd(10 + houses.length) });
            return true;
        };

        // Места под дома: сетка в клетке (1 дом — по центру, 2–4 — в два столбца, больше — в три).
        const columns = count <= 1 ? 1 : count <= 4 ? 2 : 3;
        const rows = Math.ceil(count / columns);
        const slots = [];
        for (let k = 0; k < count; k++) {
            const column = k % columns, row = Math.floor(k / columns);
            const inRow = Math.min(columns, count - row * columns);
            slots.push([
                (column + 0.5 + (columns - inRow) / 2) / columns,
                rows === 1 ? 0.8 : 0.5 + row * 0.46 / (rows - 1)
            ]);
        }

        // Размер дома подстраивается под число домов в клетке: один — крупнее, четыре — компактнее.
        const w = count === 1 ? this.pxMin(6) : this.pxMin(5);
        const bodyH = count === 1 ? this.pxMin(4) : this.pxMin(3);
        const roofH = count >= 3 ? this.pxMin(2) : this.pxMin(3);
        const group = map.settlementGroups[map.settlementGroup[i]];
        const isCenter = group && group.tile === i;
        const nudges = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [0, 1], [-1, -1], [1, -1]];

        slots.forEach(([fx, fy], k) => {
            const chapel = k === 0 && level === maxLevel && isCenter && count >= 3;   // в центре города — каменная часовня
            const kind = chapel ? 'tower' : (level === 1 && rnd(30 + k) < 0.4 ? 'hut' : 'house');
            const size = chapel ? [this.pxMin(4), this.pxMin(5), this.pxMin(5)] : kind === 'hut' ? [Math.max(2, w - 1), Math.max(2, bodyH - 1), Math.max(2, roofH - 1)] : [w, bodyH, roofH];
            // Заметный разброс по обеим осям (плюс сдвиг соседних домов в разные стороны), чтобы домики
            // в одной клетке не выстраивались на одну линию — иначе поселение выглядит «наклеенным».
            const stagger = (k & 1 ? 1 : -1) * this.pxMin(1);
            const jitterX = Math.round((rnd(40 + k) - 0.5) * this.pxMin(5)) + stagger;
            const jitterY = Math.round((rnd(50 + k) - 0.5) * this.pxMin(4)) + stagger;
            for (const [nx, ny] of nudges) {
                if (tryPlace(left + fx * T + jitterX + nx * this.pxMin(1), top + fy * T + jitterY + ny * this.pxMin(1), ...size, kind)) return;
            }
        });
        for (let attempt = 0; houses.length === 0 && attempt < 16; attempt++) {  // запасной вариант: хоть один дом в клетке
            tryPlace(left + T / 2 + (rnd(70 + attempt) - 0.5) * this.pxMin(6), top + T * 0.8 + (rnd(90 + attempt) - 0.5) * this.pxMin(4), this.pxMin(5), this.pxMin(3), this.pxMin(3), 'house');
        }

        // Утоптанная земля и улица-заготовка в сторону дороги (дороги между клетками рисует paintRoads).
        const cx = left + T / 2;
        const cy = top + T * 0.65;
        let street = [[cx, cy], [cx, cy]];
        const links = map.roadLinks[i];
        for (let d = 0; d < 8 && links; d++) {
            if (links & (1 << d)) {
                const [dx, dy] = ROAD_DIRECTIONS[d];
                street = [[cx, cy], [cx + dx * T / 2, cy + dy * T / 2]];
                break;
            }
        }
        const blobs = [[cx, cy, this.pxMin(7)]];
        for (const house of houses) blobs.push([house.x, house.base - house.bodyH / 2, this.pxMin(4)]);
        return { level, houses, blobs, street };
    },

    // Утоптанная земля вокруг домов и улица между ними (на земле, до деревьев и границ).
    paintSettlementGround() {
        const map = this.map;
        if (!this.options.settlements || map.settlements.length === 0) return;

        const size = map.size;
        const c = this.colors;
        const dirt = this.moodize(c.dirt), light = this.moodize(c.dirtLight), mud = this.moodize(c.mud);
        const streetColors = [dirt, light, mud];
        const pixels = this.pixels;

        for (const settlement of map.settlements) {
            const tile = settlement.tile;
            const ground = this.settlementGround(this.settlementLayout(tile % size, Math.floor(tile / size), tile));
            const snow = this.snowCoverage(tile);
            const snowMix = color => (snow > 0 ? mixPacked(color, this.packed.snow, 0.7 * snow) : color);

            for (let n = 0; n < ground.blobIndex.length; n++) {            // мягкие пятна утоптанной земли
                const k = ground.blobIndex[n];
                pixels[k] = mixPacked(pixels[k], snowMix(ground.blobMud[n] ? mud : dirt), ground.blobStrength[n] / 255);
            }
            for (let n = 0; n < ground.streetIndex.length; n++) {          // улица
                pixels[ground.streetIndex[n]] = snowMix(streetColors[ground.streetKind[n]]);
            }
        }
    },

    // Пиксели земли поселения (не зависят от сезона): пятна вокруг домов и улица. Считаются один раз для поселения.
    settlementGround(layout) {
        if (layout.ground) return layout.ground;

        const W = this.width;
        const relief = this.reliefHeight;
        const usable = k => !this.waterMask[k] && !(this.riverMask && this.riverMask[k]) && !(relief && relief[k] > 40);
        const strengths = new Map();
        const mudPixels = new Set();

        for (const [bx, by, radius] of layout.blobs) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const distance = Math.hypot(dx, dy);
                    const px = Math.round(bx + dx), py = Math.round(by + dy);
                    if (distance > radius || px < 0 || py < 0 || px >= W || py >= W) continue;
                    const k = py * W + px;
                    if (!usable(k) || hashUnit(px, py, 977) < 0.12) continue;
                    const strength = Math.round(255 * 0.55 * Math.pow(1 - distance / radius, 0.7));
                    if (strength > (strengths.get(k) || 0)) strengths.set(k, strength);
                    if (hashUnit(px, py, 978) < 0.3) mudPixels.add(k);
                }
            }
        }

        const street = new Map();
        const [[ax, ay], [bx, by]] = layout.street;
        const width = this.pxMin(2);
        for (const [px, py] of this.linePoints(Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by))) {
            for (let oy = 0; oy < width; oy++) {
                for (let ox = 0; ox < width; ox++) {
                    const x = px + ox - (width >> 1), y = py + oy - (width >> 1);
                    if (x < 0 || y < 0 || x >= W || y >= W || !usable(y * W + x)) continue;
                    const r = hashUnit(x, y, 975);
                    street.set(y * W + x, r < 0.2 ? 1 : r < 0.45 ? 2 : 0);
                }
            }
        }

        const blobKeys = [...strengths.keys()];
        layout.ground = {
            blobIndex: Int32Array.from(blobKeys),
            blobStrength: Uint8Array.from(blobKeys, k => strengths.get(k)),
            blobMud: Uint8Array.from(blobKeys, k => (mudPixels.has(k) ? 1 : 0)),
            streetIndex: Int32Array.from(street.keys()),
            streetKind: Uint8Array.from(street.values())
        };
        return layout.ground;
    },

    collectSettlement(items, x, y, i) {
        const layout = this.settlementLayout(x, y, i);
        const snow = this.snowCoverage(i);
        for (const part of layout.houses) {
            const sprite = this.houseSprite(part, part.roll, snow);
            items.push({ y: part.base, x: part.x, draw: () => this.drawHouse(sprite, part.x, part.base, part, layout.level) });
        }
    },

    // Лёгкое приглушение цвета построек в тёмном стиле: они должны оставаться светлее фона.
    houseColor(color) {
        return this.mood === 'dark' ? shadePacked(mixPacked(color, packRgb(128, 128, 128), 0.1), -0.06) : color;
    },

    // Рисунок здания (кэшируется): стены, крыша, дверь, контур.
    houseSprite(part, roll, snow) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = [part.kind, part.w, part.bodyH, part.roofH, Math.floor(roll * 4), Math.round(snow * 3), this.mood, this.season.name].join('|');
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const c = this.colors;
        const tower = part.kind === 'tower';
        const wall = this.houseColor(tower ? c.chapelStone : [c.wallA, c.wallB][Math.floor(roll * 2) % 2]);
        let roof = this.houseColor(part.kind === 'hut' ? c.thatch : tower ? c.roofD : [c.roofA, c.roofB, c.roofC, c.roofD][Math.floor(roll * 4) % 4]);
        if (snow > 0) roof = mixPacked(roof, this.packed.snow, 0.85 * snow);

        const pad = 1;
        const overhang = tower ? 0 : 1;
        const width = part.w + 2 * overhang + 2 * pad;
        const height = part.roofH + part.bodyH + 2 * pad;
        const buffer = new PixelBuffer(width, height);
        const left = pad + overhang;
        const top = pad + part.roofH;
        const centerX = (width - 1) / 2;

        buffer.rect(left, top, part.w, part.bodyH, wall);
        buffer.rect(left, top, 1, part.bodyH, shadePacked(wall, 0.14));                     // освещённая левая стена
        buffer.rect(left + part.w - 1, top, 1, part.bodyH, shadePacked(wall, -0.22));       // правая — в тени
        buffer.rect(left, top + part.bodyH - 1, part.w, 1, shadePacked(wall, -0.18));
        if (tower) {
            for (let y = top + 1; y < top + part.bodyH - 1; y += 2) buffer.rect(left + 1, y, part.w - 2, 1, shadePacked(wall, -0.1));   // кладка
        }

        for (let row = 0; row < part.roofH; row++) {                                        // крыша: ряды всё шире книзу
            const half = ((part.w + 2 * overhang) / 2) * (row + 1) / part.roofH;
            const y = pad + row;
            const band = row % 2 ? -0.03 : 0.05;                                            // черепица: чередование рядов
            for (let x = Math.round(centerX - half + 0.5); x <= Math.round(centerX + half - 0.5); x++) {
                buffer.put(x, y, x < centerX ? shadePacked(roof, 0.14 + band) : shadePacked(roof, -0.2 + band));
            }
        }
        buffer.rect(left + (part.w >> 1), top + part.bodyH - Math.min(2, part.bodyH - 1), 1, Math.min(2, part.bodyH - 1), c.plank);   // дверь
        if (this.options.spriteOutline) buffer.outline(c.outline);

        // Окна: чем шире дом, тем больше света в окнах.
        const windowY = top + 1;
        const windows = part.bodyH >= 3
            ? (part.w >= 5 ? [[left + 1, windowY], [left + part.w - 2, windowY]] : [[left + 1, windowY]])
            : [];
        const sprite = {
            buffer, width, height,
            anchorX: Math.round(centerX),
            anchorY: height - pad - 1,
            windows,
            chimney: !tower && part.kind === 'house' && roll > 0.4 ? [Math.round(centerX) + 1, pad - 1] : null
        };
        this.spriteCache.set(key, sprite);
        return sprite;
    },

    drawHouse(sprite, x, base, part, level) {
        const c = this.colors;
        const left = x - sprite.anchorX;
        const top = base - sprite.anchorY;

        this.drawBuildingShadow(x, base, part.w, part.bodyH + part.roofH);
        this.blitSprite(sprite.buffer, left, top);

        for (const [wx, wy] of sprite.windows) {
            const lightX = left + wx, lightY = top + wy;
            this.emissive.push(() => this.drawLight(lightX, lightY, c.window, c.fire, this.mood === 'dark' ? 2 : 1));
        }
        if (sprite.chimney && level >= 3) {
            const smokeX = left + sprite.chimney[0], smokeY = top + sprite.chimney[1];
            for (let s = 1; s <= 3; s++) this.blend(smokeX + (s % 2), smokeY - s * 2, packRgb(175, 175, 180), 0.45 - 0.1 * s);
        }
    },

    // Тень здания: пятно под ним и тень, падающая вправо-вниз (свет слева сверху, как у деревьев и гор).
    drawBuildingShadow(x, base, width, height) {
        const half = Math.ceil(width / 2) + 1;
        const length = Math.max(2, Math.round(height * 0.55));
        for (let dx = -half; dx <= half + length; dx++) {
            const edge = dx > half ? 1 - (dx - half) / (length + 1) : 1;
            this.blend(x + dx, base + 1, BLACK, 0.5 * edge);
            this.blend(x + dx, base + 2, BLACK, 0.3 * edge);
            if (dx > -half + 1 && dx < half + length - 1) this.blend(x + dx, base, BLACK, 0.2 * edge);
        }
    },
};
