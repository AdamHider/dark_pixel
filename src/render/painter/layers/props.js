import { Biome, Resource, Shore, Terrain } from '../../../map/constants.js';
import { packRgb, shadePacked } from '../../color.js';
import { hashUnit } from '../noise.js';

/* Тёмный стиль: кости, вороны, развалины, виселицы */

export const props = {
    // Кости в сухих местах, вороны, развалины, виселицы — редко и поодиночке.
    collectProps(items) {
        const map = this.map;
        const T = this.tileSize;

        this.forEachTile((x, y) => {
            const i = map.index(x, y);
            if (map.terrain[i] !== Terrain.PLAIN || map.river[i] || map.resource[i] !== Resource.NONE || map.roadLevel[i] > 0) return;
            if (map.shore[i] === Shore.BEACH) return;

            const roll = hashUnit(x, y, 950 + this.seedSalt);
            const cx = x * T + Math.round(hashUnit(x, y, 951) * (T - 2)) + 1;
            const base = y * T + Math.round(hashUnit(x, y, 952) * (T - 4)) + 3;
            const dry = [Biome.STEPPE, Biome.DESERT, Biome.TUNDRA, Biome.SAVANNA].includes(map.biome[i]);

            if (map.biome[i] === Biome.ETHER_LAND) {                 // земли эфира: тёмные кристаллы-осколки на земле
                if (roll < 0.06) items.push({ y: base, x: cx, draw: () => this.drawShard(cx, base) });
            } else if (map.biome[i] === Biome.DEAD_LAND) {           // мёртвые земли: кости и обугленные пни
                if (roll < 0.05) items.push({ y: base, x: cx, draw: () => this.drawBones(cx, base) });
                else if (roll < 0.09) items.push({ y: base, x: cx, draw: () => this.drawCharredStump(cx, base) });
            } else if (dry && roll < 0.014) items.push({ y: base, x: cx, draw: () => this.drawBones(cx, base) });
            else if (!dry && roll < 0.006) items.push({ y: base, x: cx, draw: () => this.drawCrow(cx, base) });
            else if (roll > 0.994 && roll <= 0.9985) items.push({ y: base, x: cx, draw: () => this.drawRuin(cx, base, x, y) });
            else if (roll > 0.9985) items.push({ y: base, x: cx, draw: () => this.drawGibbet(cx, base) });
        });
    },

    // Обугленный пень — мёртвое дерево, оставшееся после пожара или скверны.
    drawCharredStump(cx, base) {
        const dark = packRgb(38, 32, 30), ash = packRgb(78, 70, 66);
        this.drawShadow(cx, base, this.px(5));
        this.rect(cx - 1, base - this.px(3), this.px(3), this.px(3), dark);
        this.put(cx - 1, base - this.px(3), ash);
        this.put(cx + this.px(2), base - this.px(4), dark);
        this.put(cx - this.px(2), base - this.px(2), dark);
        this.put(cx + 1, base - this.px(5), dark);
    },

    // Осколок эфирного кристалла, торчащий из земли (без свечения — оно рисуется у ресурса эфира).
    drawShard(cx, base) {
        const light = packRgb(196, 150, 244), mid = packRgb(140, 78, 214), dark = packRgb(78, 36, 132);
        const height = this.px(3) + (hashUnit(cx, base, 954) < 0.5 ? 1 : 2);
        this.drawShadow(cx, base, this.px(3));
        for (let row = 0; row < height; row++) {
            const half = row === 0 ? 0 : 1;
            this.rect(cx - half, base - row, half + 1, 1, light);
            this.put(cx + half, base - row, dark);
            this.put(cx, base - row, mid);
        }
        this.put(cx, base - height, light);
    },

    drawBones(cx, base) {
        const bone = this.colors.bone;
        this.rect(cx - 2, base - 1, 5, 1, bone);
        this.put(cx - 1, base - 2, bone);
        this.put(cx + 1, base - 2, bone);
        this.rect(cx + 3, base - 2, 2, 2, bone);          // череп
        this.put(cx + 4, base - 2, this.colors.crow);      // глазница
    },

    drawCrow(cx, base) {
        const dark = this.colors.crow;
        this.rect(cx, base - 2, 3, 2, dark);
        this.put(cx - 1, base - 2, dark);
        this.put(cx + 1, base - 3, dark);
        this.put(cx - 2, base - 2, this.colors.stoneMid);  // клюв
    },

    // Обломки каменной стены и колонна.
    drawRuin(cx, base, tileX, tileY) {
        const stone = this.moodize(this.colors.chapelStone);
        const dark = shadePacked(stone, -0.25);
        const width = this.px(8);
        for (let dx = 0; dx < width; dx++) {
            const height = 1 + Math.floor(hashUnit(tileX * 7 + dx, tileY, 953) * this.px(4));   // рваный верх стены
            this.rect(cx - (width >> 1) + dx, base - height, 1, height, dx % 3 === 0 ? dark : stone);
        }
        this.rect(cx + (width >> 1), base - this.px(6), 2, this.px(6), stone);                   // колонна
        this.rect(cx + (width >> 1), base - this.px(6), 1, this.px(6), shadePacked(stone, 0.15));
        this.drawShadow(cx, base, width);
    },

    drawGibbet(cx, base) {
        const wood = this.packed.trunk;
        const height = this.px(10);
        this.drawShadow(cx, base, this.px(4));
        this.rect(cx, base - height, 1, height, wood);
        this.rect(cx, base - height, this.px(5), 1, wood);
        this.put(cx + this.px(4), base - height + 1, this.colors.stoneMid);                       // верёвка
        this.rect(cx + this.px(4) - 1, base - height + 2, 2, this.px(3), this.colors.crow);       // силуэт
    },
};
