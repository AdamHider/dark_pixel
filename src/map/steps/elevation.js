import { clamp, percentile } from '../../core/math.js';

/* Этап генерации: высота рельефа и острова */

export const elevation = {
    // Шум + падение к краям (вода вокруг) + хребты.
    generateElevation() {
        const o = this.options;
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const nx = x / this.size;
                const ny = y / this.size;

                // Квадрат расстояния от центра карты: 0 в центре, 1 на середине края.
                const dx = (nx - 0.5) * 2;
                const dy = (ny - 0.5) * 2;
                const distanceSq = dx * dx + dy * dy;

                // «Скручиваем» координаты: берега и хребты становятся извилистыми, а не расплывчатыми пятнами.
                const wx = nx + (this.noise.warpX.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;
                const wy = ny + (this.noise.warpY.fractal(nx * o.warpScale, ny * o.warpScale, 2) - 0.5) * o.warpStrength;

                const baseNoise = this.noise.elevation.fractal(wx * o.elevationScale, wy * o.elevationScale, o.elevationOctaves);
                // Спад к краям: чем больше falloffPower, тем ровнее «плато» внутри и тем резче обрыв у краёв.
                const falloff = Math.pow(Math.sqrt(distanceSq), o.falloffPower) * o.islandFalloff;
                let height = baseNoise * 0.9 + o.baseElevation - falloff;

                // Регулятор формы: среднемасштабный шум ломает береговую линию —
                // появляются заливы, полуострова и острова вдали от материка.
                const shapeNoise = this.noise.shape.fractal(wx * o.shapeScale, wy * o.shapeScale, 3);
                height += (shapeNoise - 0.5) * o.shapeVariety * 2.4;

                // Мелкая изрезанность берега: ещё более частый шум добавляет мысы, бухточки и лагуны,
                // чтобы линия берега не была «квадратной» даже на уровне отдельных клеток.
                const coastNoise = this.noise.coastDetail.fractal(wx * o.coastDetailScale, wy * o.coastDetailScale, 3);
                height += (coastNoise - 0.5) * o.coastDetail * 2.4;

                // Внутренние моря: крупные впадины, вырезанные во внутренних областях.
                const basinNoise = this.noise.basin.fractal(wx * o.inlandSeaScale, wy * o.inlandSeaScale, 2);
                height -= Math.max(0, basinNoise - 0.5) * 4 * o.inlandSeaStrength * clamp(1.3 - distanceSq);

                // Хребты: линии, где шум близок к 0.5, поднимаем вверх. Возле краёв карты хребты слабее.
                const ridgeNoise = this.noise.ridge.fractal(wx * o.ridgeScale, wy * o.ridgeScale, 4);
                const ridge = Math.pow(1 - Math.abs(2 * ridgeNoise - 1), o.ridgeSharpness);
                height += ridge * o.ridgeStrength * clamp(1.2 - distanceSq);

                const i = this.index(x, y);
                this.elevation[i] = height;
                this.ridge[i] = ridge;
                this.massif[i] = this.noise.massif.fractal(wx * o.massifScale, wy * o.massifScale, 3);
            }
        }
    },

    // Острова: в полосе мелководья вокруг материка отдельные «горбы» шума поднимаем над уровнем моря.
    scatterIslands() {
        const o = this.options;
        if (o.islandDensity <= 0) return;

        const estimatedSea = percentile(this.elevation, o.waterShare);
        const threshold = 0.72 - 0.16 * o.islandDensity; // выше плотность — ниже порог — больше островов
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const i = this.index(x, y);
                const belowSea = estimatedSea - this.elevation[i];
                if (belowSea <= 0 || belowSea > 0.15) continue; // только полоса моря недалеко от «почти суши»

                const bump = this.noise.islands.fractal((x / this.size) * o.islandScale, (y / this.size) * o.islandScale, 2);
                if (bump > threshold) this.elevation[i] = estimatedSea + 0.01 + (bump - threshold) * 0.5;
            }
        }
    },
};
