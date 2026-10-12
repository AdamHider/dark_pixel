import { mixPacked } from '../../color.js';

/* Границы регионов */

export const borders = {
    // Тонкая линия на правом/нижнем краю клетки, если за ней другой регион.
    // Над рекой границы не рисуем (иначе посреди воды появлялись бы чёрточки), а над горами делаем бледнее.
    paintRegionBorders() {
        const { size, regionId } = this.map;
        const T = this.tileSize;
        const W = this.width;
        const mask = this.riverMask;
        const relief = this.reliefHeight;
        const color = this.colors.regionBorder;

        const draw = (px, py) => {
            const k = py * W + px;
            if (mask && mask[k]) return;
            const alpha = relief ? 0.6 - 0.5 * Math.min(1, relief[k] / 110) : 0.6; // в горах границы почти растворяются
            this.pixels[k] = mixPacked(this.pixels[k], color, alpha);
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = y * size + x;
                if (regionId[i] === -1) continue;

                const right = x < size - 1 ? regionId[i + 1] : -1;
                const below = y < size - 1 ? regionId[i + size] : -1;
                if (right !== -1 && right !== regionId[i]) {
                    for (let d = 0; d < T; d++) draw(x * T + T - 1, y * T + d);
                }
                if (below !== -1 && below !== regionId[i]) {
                    for (let d = 0; d < T; d++) draw(x * T + d, y * T + T - 1);
                }
            }
        }
    },
};
