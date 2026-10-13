import { mixPacked, packRgb, shadePacked } from '../../color.js';
import { hashUnit } from '../noise.js';
import { PixelBuffer } from '../pixel-buffer.js';

/* Крепости фракций: каменный донжон с зубцами и знаменем цвета фракции.
   Три вида (fortress.kind): 'keep' — сторожевой пост, 'mountain' — высокая горная твердыня,
   'coast' — порт-крепость с причалом. Рисуются как декорации сцены (layers/scene.js), поэтому
   перекрываются деревьями и горами правильно. */

export const fortresses = {
    // Один спрайт на (вид, фракция, стиль, сезон): знамя берёт цвет фракции, стены приглушаются в тёмном стиле.
    fortressSprite(kind, factionId) {
        if (!this.spriteCache) this.spriteCache = new Map();
        const key = ['fortress', kind, factionId, this.mood, this.season.name].join('|');
        const cached = this.spriteCache.get(key);
        if (cached) return cached;

        const c = this.colors;
        const stone = this.moodize(c.stone);
        const stoneDark = this.moodize(c.stoneShadow);
        const flag = this.factionColor(factionId);
        const tall = kind === 'mountain';

        const width = this.pxMin(tall ? 12 : 13);
        const height = this.pxMin(tall ? 16 : 13);
        const buffer = new PixelBuffer(width, height);
        const mid = width >> 1;
        const floor = height - 2;

        const bodyWidth = this.pxMin(tall ? 7 : 9);
        const bodyHeight = this.pxMin(tall ? 10 : 6);
        const left = mid - (bodyWidth >> 1);
        const top = floor - bodyHeight;

        buffer.rect(left, top, bodyWidth, bodyHeight, stone);
        buffer.rect(left, top, 1, bodyHeight, shadePacked(stone, 0.14));                 // светлая левая стена
        buffer.rect(left + bodyWidth - 1, top, 1, bodyHeight, shadePacked(stone, -0.22)); // правая в тени
        buffer.rect(left, floor - 1, bodyWidth, 1, shadePacked(stone, -0.18));

        for (let x = left; x < left + bodyWidth; x += 2) {                              // зубцы наверху
            buffer.rect(x, top - this.pxMin(2), 1, this.pxMin(2), stone);
        }
        const gateWidth = this.pxMin(2), gateHeight = this.pxMin(3);
        buffer.rect(mid - (gateWidth >> 1), floor - gateHeight, gateWidth, gateHeight, packRgb(48, 34, 22));

        if (kind === 'coast') {                                                          // причал сбоку
            const pierY = floor - this.pxMin(2);
            buffer.rect(left + bodyWidth, pierY, this.pxMin(4), 1, this.moodize(c.plank));
            buffer.rect(left + bodyWidth, pierY + 1, 1, this.pxMin(2), shadePacked(this.moodize(c.plank), -0.2));
        }
        if (tall) {                                                                      // скала у основания
            buffer.ellipse(mid, floor, this.pxMin(5), this.pxMin(2), stoneDark, stone, stoneDark);
        }

        const poleX = left + bodyWidth - 1;                                              // знамя фракции
        const poleTop = top - this.pxMin(tall ? 6 : 5);
        buffer.rect(poleX, poleTop, 1, top - poleTop, stoneDark);
        buffer.rect(poleX + 1, poleTop + 1, this.pxMin(3), this.pxMin(2), flag);

        if (this.options.spriteOutline) buffer.outline(c.outline);

        const sprite = { buffer, width, height, anchorX: mid, anchorY: floor + 1 };
        this.spriteCache.set(key, sprite);
        return sprite;
    },

    drawFortress(x, y, fortress) {
        const T = this.tileSize;
        const sprite = this.fortressSprite(fortress.kind, fortress.factionId);
        const cx = x * T + Math.round(T / 2) + Math.round((hashUnit(x, y, 60) - 0.5) * 0.15 * T);
        const base = y * T + Math.round(T * 0.86) - this.liftAtTile(x, y);

        this.drawBuildingShadow(cx, base, this.px(8), this.px(7));
        this.blitSprite(sprite.buffer, cx - sprite.anchorX, base - sprite.anchorY);

        const lightX = cx - sprite.anchorX + (sprite.width >> 1);                        // огонёк в воротах
        const lightY = base - sprite.anchorY + sprite.height - this.pxMin(4);
        this.emissive.push(() => this.drawLight(lightX, lightY, this.colors.window, this.colors.fire, this.mood === 'dark' ? 2 : 1));
    },

    // Свечение знамени в тёмном стиле (чтобы крепость читалась на тёмной карте).
    fortressBannerGlow(fortress) {
        return mixPacked(this.factionColor(fortress.factionId), packRgb(255, 255, 255), 0.25);
    }
};
