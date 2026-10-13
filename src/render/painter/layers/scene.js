import { Resource } from '../../../map/constants.js';

/* Сцена: горы и декорации, отсортированные сверху вниз (перспектива) */

export const scene = {
    /* Все декорации собираем в один список и рисуем по возрастанию «основания» (нижней точки):
       то, что стоит ниже на карте, перекрывает то, что выше, — как в перспективе. Деревья могут свободно
       выходить за границы своей клетки: порядок всё равно будет правильным. */
    // Рисует горы и декорации вместе, строка за строкой сверху вниз: так то, что южнее (ближе к зрителю),
    // перекрывает то, что севернее, — деревья и горы перекрывают друг друга правильно.
    paintScene() {
        const items = this.collectDecorations();
        const relief = this.prepareReliefRows();
        let next = 0;
        for (let gy = 0; gy < this.width; gy++) {
            if (relief) this.paintReliefRow(relief, gy);
            while (next < items.length && items[next].y <= gy) items[next++].draw();
        }
    },

    // Список декораций, отсортированный по «основанию» (нижней точке).
    collectDecorations() {
        const map = this.map;
        const T = this.tileSize;
        const items = [];

        this.forEachTile((x, y) => {
            const i = map.index(x, y);
            if (map.crossing[i]) this.paintCrossing(x, y, i);

            switch (map.resource[i]) {
                case Resource.WOOD: this.collectTrees(items, x, y, i); break;
                case Resource.WHEAT: items.push({ y: y * T + Math.round(T * 0.6), x: x * T, draw: () => this.drawWheat(x, y) }); break;
                case Resource.GOLD: items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, 'gold') }); break;
                case Resource.IRON: items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawOreTile(x, y, 'iron') }); break;
                case Resource.ETHER:
                    if (this.mood === 'dark') this.emissive.push(() => this.drawEther(x, y));   // самый яркий элемент мира: после цветокоррекции
                    else items.push({ y: y * T + Math.round(T * 0.8), x: x * T, draw: () => this.drawEther(x, y) });
                    break;
                case Resource.SETTLEMENT: this.collectSettlement(items, x, y, i); break;
            }
        });

        if (this.mood === 'dark' && this.options.props) this.collectProps(items);
        if (this.options.fortresses && map.fortresses) {
            for (const fortress of map.fortresses) {
                const x = fortress.tile % map.size, y = Math.floor(fortress.tile / map.size);
                items.push({ y: y * T + Math.round(T * 0.9), x: x * T, draw: () => this.drawFortress(x, y, fortress) });
            }
        }

        items.sort((a, b) => a.y - b.y || a.x - b.x);
        return items;
    },
};
