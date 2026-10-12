import { MinHeap } from '../../core/min-heap.js';
import { hash32 } from '../../core/random.js';
import { Resource, Terrain } from '../constants.js';

/* Этап генерации: озёра, реки, мосты и броды */

export const rivers = {
    /* Реки — часть рельефа, а не линии, нарисованные поверх: вода стекает по высотам.
       1) «Заливка впадин» (priority-flood): из моря и краёв карты затопляем сушу от низких мест к высоким; так у каждой
          клетки появляется сток (flowTo) к морю, а впадины, которые не имеют стока, становятся озёрами.
       2) Подсчёт стока: дождь выпадает на каждую клетку (во влажных местах больше) и стекает вниз по flowTo; в каждой
          клетке накапливается вода всех клеток выше по течению. Где её много — там река; чем больше воды, тем река шире.
       Получаются притоки, слияния, бассейны — как в природе, а не 16 одиноких ручьёв. */

    fillDepressions() {
        const o = this.options;
        const size = this.size;
        const count = size * size;
        const filled = new Float32Array(count);
        const flowTo = new Int32Array(count).fill(-1);
        const done = new Uint8Array(count);
        const heap = new MinHeap();
        const jitter = i => (hash32(i) / 4294967296) * o.riverMeander;  // чтобы русла петляли, а не шли по линейке

        for (let i = 0; i < count; i++) {
            const x = i % size, y = Math.floor(i / size);
            const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
            if (!this.isLand(i)) {
                done[i] = 1;
                filled[i] = this.seaLevel;
                if (this.neighbors8(i).some(j => this.isLand(j))) heap.push(this.seaLevel, i, 0);
            } else if (onEdge) {
                done[i] = 1;
                filled[i] = this.elevation[i] + jitter(i);
                heap.push(filled[i], i, 0);
            }
        }
        while (heap.size > 0) {
            const [level, current] = heap.pop();
            for (const next of this.neighbors8(current)) {
                if (done[next]) continue;
                done[next] = 1;
                flowTo[next] = current;
                // Шаг заливки случайный (и длиннее по диагонали): на плоских местах русла петляют, а не бегут параллельными прямыми.
                const step = 2e-4 * (0.3 + 2 * (hash32(next + 7919) / 4294967296)) * (this.isDiagonal(current, next) ? 1.4 : 1);
                filled[next] = Math.max(this.elevation[next] + jitter(next), level + step);
                heap.push(filled[next], next, 0);
            }
        }
        this.filled = filled;
        this.flowTo = flowTo;

        // Озёра: впадины достаточной глубины и размера.
        const deep = new Uint8Array(count);
        for (const i of this.landTiles) {
            if (this.terrain[i] === Terrain.PLAIN && filled[i] - this.elevation[i] > o.lakeDepth) deep[i] = 1;
        }
        const seen = new Uint8Array(count);
        for (const start of this.landTiles) {
            if (!deep[start] || seen[start]) continue;
            const queue = [start];
            seen[start] = 1;
            for (let head = 0; head < queue.length; head++) {
                for (const next of this.neighbors(queue[head])) {
                    if (deep[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
                }
            }
            if (queue.length < o.lakeMinSize) continue;
            for (const i of queue) {
                this.terrain[i] = Terrain.DEEP_WATER;
                this.mountainHeight[i] = 0;
            }
        }
        this.collectLandTiles();
    },

    isDiagonal(a, b) {
        return (a % this.size !== b % this.size) && (Math.floor(a / this.size) !== Math.floor(b / this.size));
    },

    generateRivers() {
        const o = this.options;
        const count = this.size * this.size;

        // Дождь на каждую клетку суши; воду собираем сверху вниз (от высоких клеток к низким), в том числе через озёра.
        const flow = new Float32Array(count);
        const order = [];
        for (let i = 0; i < count; i++) {
            if (this.flowTo[i] !== -1) order.push(i);
            if (this.isLand(i)) flow[i] = o.rainfall * (0.4 + 1.6 * this.moisture[i]) * (this.terrain[i] === Terrain.MOUNTAIN ? 1.3 : 1);
        }
        order.sort((a, b) => this.filled[b] - this.filled[a]);
        for (const i of order) flow[this.flowTo[i]] += flow[i];

        const [first] = o.riverThresholds;
        for (const i of this.landTiles) {
            if (this.terrain[i] !== Terrain.PLAIN || flow[i] < first) continue;
            this.river[i] = 1;                                       // у всех рек глубина воды 1 (мелкие, брод по колено)
            this.riverFlow[i] = Math.min(65535, Math.round(flow[i])); // расход воды: от него зависит ширина русла
            this.riverTo[i] = this.flowTo[i];
            this.resource[i] = Resource.NONE;                        // на реке ресурсов нет
        }
    },

    // Переправы: на прямых участках рек (вода входит и выходит в одном направлении) изредка ставим брод.
    // У всех рек глубина 1, поэтому мосты не нужны — только каменные ступени-броды.
    placeRiverCrossings() {
        const size = this.size;
        const upstream = new Map();                                  // клетка -> реки, впадающие в неё
        for (const i of this.landTiles) {
            if (this.river[i] > 0 && this.riverTo[i] !== -1 && this.river[this.riverTo[i]] > 0) {
                if (!upstream.has(this.riverTo[i])) upstream.set(this.riverTo[i], []);
                upstream.get(this.riverTo[i]).push(i);
            }
        }
        const direction = (from, to) => [(to % size) - (from % size), Math.floor(to / size) - Math.floor(from / size)];

        for (const i of this.landTiles) {
            if (this.river[i] === 0 || this.riverTo[i] === -1 || this.crossing[i]) continue;
            const sources = upstream.get(i) || [];
            if (sources.length !== 1) continue;                       // начало реки или слияние — не место для моста
            const [ax, ay] = direction(sources[0], i), [bx, by] = direction(i, this.riverTo[i]);
            if (ax !== bx || ay !== by) continue;                    // поворот
            if (this.random() > this.options.riverCrossingChance) continue;
            if (this.neighbors8(i).some(j => this.crossing[j])) continue;
            this.crossing[i] = 1;                                    // глубина реки 1 — только брод
        }
    },
};
