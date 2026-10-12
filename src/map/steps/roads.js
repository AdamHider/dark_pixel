import { MinHeap } from '../../core/min-heap.js';
import { Biome, ROAD_DIRECTIONS, Resource, Terrain } from '../constants.js';

/* Этап генерации: дороги между поселениями */

export const roads = {
    /* Дороги между поселениями по всей карте. Каждое поселение соединяется с ближайшими соседями; рёбра берутся по
       возрастанию длины, и в «каркас» попадают те, что связывают ещё не связанные группы (как остовное дерево), плюс
       несколько ближайших пар для петель. Путь ищет A*: горы и вода непроходимы, лес и подъёмы замедляют, а чужие
       дороги дёшевы — поэтому дороги сливаются в магистрали. Где дорога пересекает реку, ставится мост или брод. */
    buildRoads() {
        const o = this.options;
        const list = this.settlementGroups;
        if (!o.roads || list.length < 2) return;

        // 1) кандидаты в рёбра: K ближайших соседей каждого поселения
        const coords = list.map(s => [s.tile % this.size, Math.floor(s.tile / this.size)]);
        const edges = [];
        const seen = new Set();
        const bucketSize = 16;
        const buckets = new Map();
        coords.forEach(([x, y], id) => {
            const key = Math.floor(x / bucketSize) + ',' + Math.floor(y / bucketSize);
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(id);
        });
        const reach = Math.ceil(o.roadMaxDistance / bucketSize);

        coords.forEach(([x, y], id) => {
            const near = [];
            for (let by = Math.floor(y / bucketSize) - reach; by <= Math.floor(y / bucketSize) + reach; by++) {
                for (let bx = Math.floor(x / bucketSize) - reach; bx <= Math.floor(x / bucketSize) + reach; bx++) {
                    for (const other of buckets.get(bx + ',' + by) || []) {
                        if (other === id) continue;
                        const distance = Math.hypot(coords[other][0] - x, coords[other][1] - y);
                        if (distance <= o.roadMaxDistance) near.push({ other, distance });
                    }
                }
            }
            near.sort((a, b) => a.distance - b.distance);
            near.slice(0, o.roadNeighbors).forEach(({ other, distance }, rank) => {
                const key = Math.min(id, other) * 100000 + Math.max(id, other);
                if (seen.has(key)) return;
                seen.add(key);
                edges.push({ a: id, b: other, distance, rank });
            });
        });
        edges.sort((p, q) => p.distance - q.distance);

        // 2) каркас (связываем несвязанное) + петли (ближайшие пары)
        const parent = list.map((_, i) => i);
        const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        for (const edge of edges) {
            const joins = find(edge.a) !== find(edge.b);
            const loop = !joins && (edge.rank === 0 || (edge.rank === 1 && this.random() < o.roadLoopChance));
            if (!joins && !loop) continue;

            const path = this.findRoadPath(list[edge.a].tile, list[edge.b].tile);
            if (!path) continue;                                  // например, через море
            if (joins) parent[find(edge.a)] = find(edge.b);
            this.carveRoad(path);
        }
    },

    // Поиск пути A* от клетки к клетке; null, если пути нет.
    findRoadPath(start, goal) {
        const size = this.size;
        const count = size * size;
        if (!this.searchCost) {
            this.searchCost = new Float32Array(count);
            this.searchStamp = new Int32Array(count);
            this.searchFrom = new Int32Array(count);
            this.searchRun = 0;
        }
        const cost = this.searchCost, stamp = this.searchStamp, from = this.searchFrom;
        const run = ++this.searchRun;
        const goalX = goal % size, goalY = Math.floor(goal / size);
        const heuristic = i => Math.hypot((i % size) - goalX, Math.floor(i / size) - goalY) * 0.4;

        const heap = new MinHeap();
        cost[start] = 0;
        stamp[start] = run;
        from[start] = -1;
        heap.push(heuristic(start), start, 0);

        while (heap.size > 0) {
            const [, current, spent] = heap.pop();
            if (spent > cost[current] + 1e-6) continue;           // устаревшая запись
            if (current === goal) {
                const path = [];
                for (let i = goal; i !== -1; i = from[i]) path.push(i);
                return path.reverse();
            }

            const x = current % size, y = Math.floor(current / size);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                    const next = ny * size + nx;

                    const step = this.roadStepCost(current, next, dx !== 0 && dy !== 0, x, y, dx, dy);
                    if (step === Infinity) continue;
                    const total = cost[current] + step;
                    if (stamp[next] !== run || total < cost[next]) {
                        stamp[next] = run;
                        cost[next] = total;
                        from[next] = current;
                        heap.push(total + heuristic(next), next, total);
                    }
                }
            }
        }
        return null;
    },

    // Цена шага по дороге в клетку next (Infinity — нельзя).
    roadStepCost(current, next, diagonal, x, y, dx, dy) {
        if (this.terrain[next] !== Terrain.PLAIN) return Infinity;           // вода и горы
        if (diagonal) {                                                      // по диагонали нельзя «срезать угол» воды, гор и рек
            for (const j of [y * this.size + x + dx, (y + dy) * this.size + x]) {
                if (this.terrain[j] !== Terrain.PLAIN || this.river[j]) return Infinity;
            }
        }

        let cost = diagonal ? 1.414 : 1;
        if (this.river[next]) cost += 3;                                     // мост — дорого
        if (this.resource[next] === Resource.WOOD) cost *= 1.5;
        else if (this.resource[next] === Resource.WHEAT) cost *= 1.15;
        if (this.biome[next] === Biome.TUNDRA || this.biome[next] === Biome.DESERT) cost *= 1.4;
        cost += Math.abs(this.elevation[next] - this.elevation[current]) * 12; // подъёмы
        if (this.roadLevel[next] > 0) cost *= 0.4;                           // готовые дороги дёшевы
        return cost;
    },

    // Сохраняет путь: уровень дороги в клетках (где дорогу используют несколько путей — выше), связи с соседями и мосты через реки.
    carveRoad(path) {
        const size = this.size;
        const direction = (from, to) => {
            const dx = (to % size) - (from % size), dy = Math.floor(to / size) - Math.floor(from / size);
            return ROAD_DIRECTIONS.findIndex(([ax, ay]) => ax === dx && ay === dy);
        };

        path.forEach((tile, k) => {
            this.roadLevel[tile] = Math.min(3, this.roadLevel[tile] + 1);
            if (this.river[tile] > 0 && this.crossing[tile] === 0) this.crossing[tile] = this.riverCrossingType(tile);
            if (k === 0) return;
            const previous = path[k - 1];
            const forward = direction(previous, tile);
            this.roadLinks[previous] |= 1 << forward;
            this.roadLinks[tile] |= 1 << (7 - forward);                      // противоположное направление в списке — зеркальный индекс
        });
    },
};
