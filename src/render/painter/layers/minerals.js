import { packRgb } from '../../color.js';
import { hashUnit, tileHash } from '../noise.js';
import { PixelBuffer } from '../pixel-buffer.js';

/* Руда (золото, железо) и эфир */

export const minerals = {
    // Рисунок из буфера на карту: прозрачные пиксели пропускаем.
    blitSprite(buffer, left, top) {
        for (let y = 0; y < buffer.height; y++) {
            for (let x = 0; x < buffer.width; x++) {
                const color = buffer.data[y * buffer.width + x];
                if (color !== 0) this.put(left + x, top + y, color);
            }
        }
    },

    // Каменный выступ с вкраплениями руды. kind: 'gold' (золото — яркое, с блёстками) или 'iron' (железо — тёмное, ржавое).
    oreSprite(kind, variant) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = 'ore|' + kind + '|' + variant;
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const n = value => Math.max(1, this.px(value));
        const gold = kind === 'gold';
        const stone = gold ? [packRgb(150, 146, 150), packRgb(114, 110, 116), packRgb(78, 74, 82)] : [packRgb(120, 132, 146), packRgb(86, 96, 108), packRgb(54, 62, 74)];
        const oreLight = gold ? packRgb(255, 243, 168) : packRgb(207, 218, 228);
        const ore = gold ? packRgb(247, 212, 74) : packRgb(176, 92, 54);
        const oreDark = gold ? packRgb(168, 122, 20) : packRgb(98, 48, 30);

        const width = n(14), height = n(11);
        const buffer = new PixelBuffer(width, height);
        const mid = width >> 1, floor = height - 2;

        // два-три камня разного размера
        const rocks = [[mid - n(3), floor - n(2), n(4), n(3)], [mid + n(2), floor - n(2) - (variant % 2), n(4), n(4)], [mid - 1, floor - n(4), n(3), n(3)]];
        for (const [cx, cy, rx, ry] of rocks) buffer.ellipse(cx, cy, rx, ry, stone[1], stone[0], stone[2]);

        // вкрапления руды: самородки на камнях (золото — крупные и яркие, железо — ржавые жилы с блеском стали)
        const spots = gold
            ? [[mid - n(3), floor - n(3)], [mid + n(3), floor - n(3)], [mid, floor - n(5)], [mid + 1, floor - 1]]
            : [[mid - n(3), floor - n(2)], [mid + n(2), floor - n(3)], [mid, floor - n(4)], [mid - 1, floor - 1], [mid + n(4), floor - 1]];
        spots.forEach(([sx, sy], k) => {
            const size = gold ? (k === 2 ? n(3) : n(2)) : n(2);
            buffer.rect(sx, sy, size, size, ore);
            buffer.rect(sx + 1, sy + size, size, 1, oreDark);
            buffer.rect(sx + size, sy + 1, 1, size, oreDark);
            buffer.put(sx, sy, oreLight);
            if (!gold && k % 2 === 0) buffer.put(sx + size - 1, sy, oreLight);
        });
        if (this.options.spriteOutline) buffer.outline(this.colors.outline);

        const sprite = { buffer, width, height, anchorX: mid, anchorY: floor + 1, sparkles: gold ? [[mid - n(3), floor - n(4)], [mid + n(3), floor - n(4)], [mid, floor - n(6)]] : [] };
        this.spriteCache.set(key, sprite);
        return sprite;
    },

    drawOreTile(x, y, kind) {
        const T = this.tileSize;
        const sprite = this.oreSprite(kind, tileHash(x, y, 80) % 3);
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 80) - 0.5) * 0.2 * T);
        const base = y * T + Math.round(T * 0.8) + Math.round((hashUnit(x, y, 81) - 0.5) * 0.2 * T) - this.liftAtTile(x, y);

        this.drawBuildingShadow(cx, base, this.px(7), this.px(5));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);

        // блёстки золота — в тёмном стиле светятся (рисуются после цветокоррекции)
        for (const [sx, sy] of sprite.sparkles) {
            const px = cx - sprite.anchorX + sx, py = base - sprite.anchorY + sy;
            this.emissive.push(() => {
                this.put(px, py, packRgb(255, 255, 230));
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.blend(px + dx, py + dy, packRgb(255, 240, 160), 0.7);
            });
        }
    },

    etherSprite(variant) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = 'ether|' + variant;
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const n = value => Math.max(1, this.px(value));
        const light = packRgb(214, 170, 255), mid = packRgb(160, 90, 240), dark = packRgb(91, 42, 158), tip = packRgb(248, 232, 255);
        const width = n(16), height = n(16);
        const buffer = new PixelBuffer(width, height);
        const floor = height - 2;
        const middle = width >> 1;

        if (variant === 2) {
            // гигантские грибы: светлая ножка, купол с тёмной «изнанкой» и светящимися пятнами
            const mushroom = (cx, stem, capW, capH) => {
                buffer.rect(cx - 1, floor - stem, 2, stem, packRgb(222, 206, 244));
                buffer.rect(cx, floor - stem, 1, stem, packRgb(176, 156, 214));
                const capY = floor - stem - capH + 1;
                buffer.ellipse(cx, capY + capH - 1, capW, capH, mid, light, dark);
                buffer.rect(cx - capW + 1, capY + capH - 1, capW * 2 - 1, 1, dark);   // изнанка шляпки
                buffer.put(cx - 1, capY + 1, tip);
                buffer.put(cx + 2, capY + 2, tip);
                buffer.put(cx - capW + 2, capY + capH - 2, tip);
            };
            mushroom(middle - n(3), n(5), n(4), n(3));
            mushroom(middle + n(3), n(7), n(5), n(4));
            mushroom(middle, n(3), n(3), n(2));
        } else {
            // кристаллы: три остроконечные призмы разной высоты (левая грань светлая, правая тёмная)
            const crystal = (cx, crystalWidth, crystalHeight) => {
                for (let row = 0; row < crystalHeight; row++) {
                    const half = Math.max(0, Math.round((crystalWidth / 2) * Math.min(1, (row + 1) / (crystalHeight * 0.7))));
                    const y = floor - crystalHeight + 1 + row;
                    buffer.rect(cx - half, y, half + 1, 1, light);
                    buffer.rect(cx + 1, y, half, 1, dark);
                    buffer.put(cx, y, mid);
                }
                buffer.put(cx, floor - crystalHeight + 1, tip);
            };
            crystal(middle - n(3), n(3), n(8));
            crystal(middle + n(2), n(4), n(12));
            crystal(middle + n(5), n(2), n(6));
            buffer.ellipse(middle, floor, n(6), 1, dark, mid, dark);
        }
        if (this.options.spriteOutline) buffer.outline(packRgb(34, 14, 66));

        const sprite = { buffer, width, height, anchorX: middle, anchorY: floor + 1 };
        this.spriteCache.set(key, sprite);
        return sprite;
    },

    drawEther(x, y) {
        const T = this.tileSize;
        const c = this.colors;
        const variant = tileHash(x, y, 90) % 3 === 2 ? 2 : tileHash(x, y, 90) % 2;
        const sprite = this.etherSprite(variant);
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 91) - 0.5) * 0.2 * T);
        const base = y * T + Math.round(T * 0.82) - this.liftAtTile(x, y);

        // сначала свечение (синхронно с землёй), потом сам рисунок
        this.drawLight(cx, base - this.px(5), c.riftCore, c.riftGlow, this.px(6));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);
        this.drawLight(cx, base - this.px(8), c.riftCore, c.riftGlow, this.px(3));
    },
};
