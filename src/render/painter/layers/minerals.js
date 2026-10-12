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

        const gold = kind === 'gold';
        const stone = gold ? [packRgb(150, 146, 150), packRgb(114, 110, 116), packRgb(78, 74, 82)] : [packRgb(120, 132, 146), packRgb(86, 96, 108), packRgb(54, 62, 74)];
        const oreLight = gold ? packRgb(255, 243, 168) : packRgb(207, 218, 228);
        const ore = gold ? packRgb(247, 212, 74) : packRgb(176, 92, 54);
        const oreDark = gold ? packRgb(168, 122, 20) : packRgb(98, 48, 30);

        const width = this.pxMin(14), height = this.pxMin(11);
        const buffer = new PixelBuffer(width, height);
        const mid = width >> 1, floor = height - 2;

        // два-три камня разного размера
        const rocks = [[mid - this.pxMin(3), floor - this.pxMin(2), this.pxMin(4), this.pxMin(3)], [mid + this.pxMin(2), floor - this.pxMin(2) - (variant % 2), this.pxMin(4), this.pxMin(4)], [mid - 1, floor - this.pxMin(4), this.pxMin(3), this.pxMin(3)]];
        for (const [cx, cy, rx, ry] of rocks) buffer.ellipse(cx, cy, rx, ry, stone[1], stone[0], stone[2]);

        // вкрапления руды: самородки на камнях (золото — крупные и яркие, железо — ржавые жилы с блеском стали)
        const spots = gold
            ? [[mid - this.pxMin(3), floor - this.pxMin(3)], [mid + this.pxMin(3), floor - this.pxMin(3)], [mid, floor - this.pxMin(5)], [mid + 1, floor - 1]]
            : [[mid - this.pxMin(3), floor - this.pxMin(2)], [mid + this.pxMin(2), floor - this.pxMin(3)], [mid, floor - this.pxMin(4)], [mid - 1, floor - 1], [mid + this.pxMin(4), floor - 1]];
        spots.forEach(([sx, sy], k) => {
            const size = gold ? (k === 2 ? this.pxMin(3) : this.pxMin(2)) : this.pxMin(2);
            buffer.rect(sx, sy, size, size, ore);
            buffer.rect(sx + 1, sy + size, size, 1, oreDark);
            buffer.rect(sx + size, sy + 1, 1, size, oreDark);
            buffer.put(sx, sy, oreLight);
            if (!gold && k % 2 === 0) buffer.put(sx + size - 1, sy, oreLight);
        });
        if (this.options.spriteOutline) buffer.outline(this.colors.outline);

        const sprite = { buffer, width, height, anchorX: mid, anchorY: floor + 1, sparkles: gold ? [[mid - this.pxMin(3), floor - this.pxMin(4)], [mid + this.pxMin(3), floor - this.pxMin(4)], [mid, floor - this.pxMin(6)]] : [] };
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

    // Один вид объекта на эфирной клетке: небольшой кристалл (примерно вдвое ниже дерева).
    // Кэшируется; форма задана в «пикселях клетки 16» и масштабируется через px().
    etherSprite() {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = 'ether';
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const width = this.pxMin(6), height = this.pxMin(7);
        const buffer = new PixelBuffer(width, height);
        const middle = width >> 1, floor = height - 1;
        const light = packRgb(216, 176, 255), mid = packRgb(158, 92, 240), dark = packRgb(88, 42, 156), tip = packRgb(248, 236, 255);

        // Один кристалл: остроконечный сверху и снизу, с широкой серединой (гранёная призма).
        const halfWidth = Math.max(1, Math.round(width * 0.32));
        const tipRows = Math.max(1, Math.round(height * 0.3));
        for (let row = 0; row < height; row++) {
            const half = row < tipRows ? Math.round(halfWidth * (row + 1) / tipRows)
                : row >= height - tipRows ? Math.round(halfWidth * (height - row) / tipRows)
                    : halfWidth;
            for (let dx = -half; dx <= half; dx++) {
                buffer.put(middle + dx, row, dx < 0 ? light : dx > 0 ? dark : mid);   // свет слева, тень справа
            }
        }
        buffer.put(middle - 1, tipRows, tip);                                          // блик у вершины
        if (this.options.spriteOutline) buffer.outline(packRgb(34, 14, 66));

        const sprite = { buffer, width, height, anchorX: middle, anchorY: floor };
        this.spriteCache.set(key, sprite);
        return sprite;
    },

    drawEther(x, y) {
        const T = this.tileSize;
        const c = this.colors;
        const sprite = this.etherSprite();
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 91) - 0.5) * 0.2 * T);
        const base = y * T + Math.round(T * 0.82) - this.liftAtTile(x, y);

        this.drawShadow(cx, base, this.px(5));                            // тень как под деревом
        this.drawLight(cx, base - this.px(4), c.riftCore, c.riftGlow, this.px(5));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);
        this.drawLight(cx, base - this.px(6), c.riftCore, c.riftGlow, this.px(2));
    },
};
