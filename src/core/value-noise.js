import { lerp } from './math.js';
import { createRandom } from './random.js';

export class ValueNoise {
    constructor(seed) {
        const random = createRandom(seed);
        this.lattice = [];
        for (let i = 0; i < 65 * 65; i++) this.lattice.push(random());
    }

    latticeValue(ix, iy) {
        return this.lattice[(iy & 63) * 65 + (ix & 63)];
    }

    // Одна «октава»: интерполяция между четырьмя ближайшими узлами решётки.
    sample(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const smooth = t => t * t * (3 - 2 * t);
        const u = smooth(x - ix);
        const v = smooth(y - iy);
        const top = lerp(this.latticeValue(ix, iy), this.latticeValue(ix + 1, iy), u);
        const bottom = lerp(this.latticeValue(ix, iy + 1), this.latticeValue(ix + 1, iy + 1), u);
        return lerp(top, bottom, v);
    }

    // Несколько октав: крупные формы + всё более мелкие детали.
    fractal(x, y, octaves) {
        let sum = 0, amplitude = 1, total = 0, frequency = 1;
        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.sample(x * frequency, y * frequency);
            total += amplitude;
            amplitude /= 2;
            frequency *= 2;
        }
        return sum / total;
    }
}
