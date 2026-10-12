import { Biome } from '../../../map/constants.js';
import { BLACK, hexToPacked, shadePacked } from '../../color.js';
import { SNOW_TEMPERATURE } from '../constants.js';
import { hashUnit, tileHash } from '../noise.js';

/* Деревья и поля */

export const vegetation = {
    // Два-три дерева на клетку, в случайных местах. Вид зависит от климата: в холодных краях ели, в тёплых лиственные.
    collectTrees(items, x, y, i) {
        const map = this.map;
        const T = this.tileSize;
        const conifer = map.biome[i] === Biome.TAIGA || map.biome[i] === Biome.TUNDRA || map.temperature[i] < 0.45;
        const withSnow = conifer && this.pal.snowOnConifers && this.seasonalTemperature(i) < SNOW_TEMPERATURE;

        const slots = [[0.26, 0.52], [0.74, 0.46], [0.5, 0.96]];
        const start = tileHash(x, y, 30) % slots.length;
        const count = 2 + (tileHash(x, y, 31) % 3 === 0 ? 1 : 0);

        for (let k = 0; k < count; k++) {
            const [fx, fy] = slots[(start + k) % slots.length];
            const cx = Math.round(x * T + fx * T + (hashUnit(x, y, 40 + k) - 0.5) * 0.25 * T);
            const base = Math.round(y * T + fy * T + (hashUnit(x, y, 50 + k) - 0.5) * 0.25 * T);
            const pick = tileHash(x, y, 60 + k);

            items.push({
                y: base,
                x: cx,
                draw: () => (conifer ? this.drawConifer(cx, base, pick, withSnow) : this.drawBroadleaf(cx, base, pick))
            });
        }
    },

    // Овальная тень под деревом.
    drawShadow(cx, base, width) {
        const half = Math.floor(width / 2);
        for (let dx = -half; dx <= half; dx++) this.blend(cx + dx, base, BLACK, 0.22);
        for (let dx = -half + 1; dx <= half - 1; dx++) this.blend(cx + dx, base + 1, BLACK, 0.12);
    },

    // Лиственное дерево: округлая крона со светом сверху-слева, летом зелёное, весной в цвету, осенью рыже-золотое.
    drawBroadleaf(cx, base, pick) {
        const pal = this.pal;
        if (pal.bareTrees || hashUnit(cx, base, 79) < (pal.deadTreeChance || 0)) {   // зимой все голые; в тёмном стиле часть мертва и летом
            this.drawBareTree(cx, base, pick);
            return;
        }

        const width = this.px(9) + (pick % 2);
        const height = width;
        const trunkHeight = this.px(3) + 1;
        const color = hexToPacked(pal.broadleaf[pick % pal.broadleaf.length]);
        const light = shadePacked(color, 0.26);
        const highlight = shadePacked(color, 0.46);
        const dark = shadePacked(color, -0.26);
        const deep = shadePacked(color, -0.48);
        const top = base - trunkHeight - height + 2;

        this.drawShadow(cx, base, width);
        // Ствол: две колонки (светлая слева) с корневищем и короткой веткой.
        this.rect(cx - 1, base - trunkHeight, 1, trunkHeight, shadePacked(this.packed.trunk, 0.12));
        this.rect(cx, base - trunkHeight, 1, trunkHeight, this.packed.trunk);
        this.put(cx - 2, base - 1, this.packed.trunk);
        this.put(cx + 1, base - 1, this.packed.trunk);
        this.put(cx - 2, top + height - 3, this.packed.trunk);       // ветка в крону слева

        for (let row = 0; row < height; row++) {
            const t = ((row + 0.5) / height) * 2 - 1;
            // Неровный край: крона не идеальный овал, а живой силуэт.
            const jitter = (hashUnit(cx, top + row, 71) - 0.5) * 1.6;
            const half = (width / 2) * Math.sqrt(Math.max(0, 1 - t * t)) + jitter;
            const x0 = Math.round(cx - half);
            const x1 = Math.round(cx + half) - 1;
            for (let x = x0; x <= x1; x++) {
                if (hashUnit(x, top + row, 72) < 0.05) continue;     // прорехи в листве
                const lean = (x - cx) + (row - height / 2);          // < 0 — верх-лево (свет), > 0 — низ-право (тень)
                let shade = lean < -width * 0.24 ? highlight : lean < -width * 0.08 ? light
                    : lean > width * 0.32 ? deep : lean > width * 0.12 ? dark : color;
                if (hashUnit(x, top + row, 77) < 0.16) shade = shade === highlight || shade === light ? color : dark; // листва «шуршит»
                this.put(x, top + row, shade);
            }
        }
        // Блик на макушке (свет слева-сверху) и тень под кроной.
        this.put(cx - 1, top + 1, highlight);
        this.put(cx - 2, top + 2, highlight);
        this.put(cx - 3, top + 3, highlight);
        if (width >= 9) this.put(cx, top + 1, light);

        if (pal.blossom && pick % 3 === 0) {
            const blossom = hexToPacked(pal.blossom);
            this.put(cx - 2, top + 2, blossom);
            this.put(cx + 1, top + 3, blossom);
            this.put(cx - 1, top + 5, blossom);
        }
    },

    // Голое дерево (зима): ствол и несколько веток.
    drawBareTree(cx, base, pick) {
        const trunk = this.packed.trunk;
        const bark = shadePacked(this.packed.trunk, -0.28);
        const height = this.px(8);
        this.drawShadow(cx, base, this.px(5));
        this.rect(cx, base - height, 1, height, trunk);
        this.put(cx - 1, base - height + 2, bark);                 // тёмная сторона ствола
        this.put(cx - 1, base - 1, trunk);
        this.put(cx + 1, base - 1, trunk);                         // корни

        const side = pick % 2 ? 1 : -1;
        for (let k = 1; k <= this.px(3); k++) {
            this.put(cx - k, base - height + k + 1, trunk);
            this.put(cx + k, base - height + k + 1 + (side > 0 ? 1 : 0), trunk);
        }
        this.put(cx + side, base - height - 1, trunk);
        if (this.mood === 'dark') {                                // кривые, корявые ветки
            this.put(cx + side * 2, base - height + 2, trunk);
            this.put(cx - side * 2, base - height + 4, trunk);
            this.put(cx + side, base - height + 5, trunk);
        } else {
            // Дополнительные ветки с развилками — «зимний» силуэт становится богаче.
            this.put(cx + side * 2, base - height + 3, trunk);
            this.put(cx + side * 3, base - height + 2, trunk);
            this.put(cx - side * 2, base - height + 5, trunk);
        }
    },

    // Ель: ярусы всё шире книзу; круглый год зелёная, зимой со снегом на лапах.
    drawConifer(cx, base, pick, withSnow) {
        const pal = this.pal;
        const color = hexToPacked(pal.conifer[pick % pal.conifer.length]);
        const light = shadePacked(color, 0.28);
        const highlight = shadePacked(color, 0.44);
        const dark = shadePacked(color, -0.34);
        const deep = shadePacked(color, -0.52);
        const height = this.px(13) + (pick % 2);
        const maxHalf = Math.max(2, Math.round(this.px(7) / 2));
        const trunkHeight = this.px(2);
        const top = base - trunkHeight - height + 1;

        this.drawShadow(cx, base, this.px(6));
        this.rect(cx, base - trunkHeight, 1, trunkHeight, this.packed.trunk);
        this.put(cx - 1, base - 1, this.packed.trunk);
        this.put(cx + 1, base - 1, this.packed.trunk);

        const rows = height;                                          // один ряд на ярус
        for (let tier = 0; tier < rows; tier++) {
            const half = Math.min(maxHalf, Math.floor(tier * (maxHalf / (height - 1)) + 0.4));
            const y = top + tier;
            for (let dx = -half; dx <= half; dx++) {
                // Левая сторона на свету, правая в тени; край справа — глубокая тень; иглы чуть мерцают.
                let shade = dx < 0 ? (dx === -half ? highlight : light) : dx > 0 ? (dx === half ? deep : dark) : color;
                if (withSnow && tier % 3 === 0) shade = dx > 0 ? this.packed.snowShade : this.packed.snow;   // снежная кромка яруса
                else if (hashUnit(cx + dx, y, 83) < 0.14) shade = dx < 0 ? light : dark;                    // хвоя
                this.put(cx + dx, y, shade);
            }
        }
        // Верхушка и одиночная снежная шапка.
        this.put(cx, top, withSnow ? this.packed.snow : highlight);
    },

    // Поле: весной ростки, летом растёт, осенью спелые колосья, зимой стерня.
    drawWheat(x, y) {
        const pal = this.pal;
        const T = this.tileSize;
        const stalk = hexToPacked(pal.wheatStalk);
        const head = hexToPacked(pal.wheatTop);

        for (let k = 0; k < 8; k++) {
            const h = tileHash(x, y, 300 + k);
            const sx = x * T + (h % T);
            const sy = y * T + this.px(4) + ((h >>> 8) % (T - this.px(4)));  // основание стебля
            const variation = (h >>> 16) % 2;

            if (pal.wheatStage === 'bare') {
                this.rect(sx, sy - 2, 1, 2, stalk);
                continue;
            }
            const stalkHeight = (pal.wheatStage === 'sprout' ? this.px(2) : pal.wheatStage === 'growing' ? this.px(4) : this.px(5)) + variation;
            this.rect(sx, sy - stalkHeight, 1, stalkHeight, stalk);
            this.put(sx, sy - stalkHeight, head);
            if (pal.wheatStage === 'ripe') this.put(sx, sy - stalkHeight - 1, head);
        }
    },
};
