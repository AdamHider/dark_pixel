/* Маленький пиксельный буфер для рисунков (дома, руды, эфир): прозрачный фон, рисование фигур, контур.
   Рисунок готовится один раз, а потом копируется на карту. */
export class PixelBuffer {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Int32Array(width * height); // 0 — прозрачно
    }

    put(x, y, color) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.data[y * this.width + x] = color;
    }

    rect(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, color);
    }

    // Эллипс с объёмом: слева сверху светлее, справа снизу темнее.
    ellipse(cx, cy, rx, ry, base, light, dark) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
                if (nx * nx + ny * ny > 1) continue;
                const lean = nx + ny;
                this.put(x, y, lean < -0.45 ? light : lean > 0.5 ? dark : base);
            }
        }
    }

    // Контур вокруг силуэта: прозрачные пиксели, у которых есть закрашенный сосед.
    outline(color) {
        const { width, height, data } = this;
        const edge = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (data[y * width + x] !== 0) continue;
                const touches = (x > 0 && data[y * width + x - 1] !== 0) || (x < width - 1 && data[y * width + x + 1] !== 0)
                    || (y > 0 && data[(y - 1) * width + x] !== 0) || (y < height - 1 && data[(y + 1) * width + x] !== 0);
                if (touches) edge.push(y * width + x);
            }
        }
        for (const index of edge) data[index] = color;
    }
}
