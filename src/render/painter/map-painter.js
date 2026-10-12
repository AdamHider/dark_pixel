import { hexToPacked, mixPacked, packPalette } from '../color.js';
import { DARK_SEASONS, SEASONS } from '../seasons.js';
import { COLORS } from './constants.js';
import { base } from './layers/base.js';
import { coast } from './layers/coast.js';
import { borders } from './layers/borders.js';
import { grading } from './layers/grading.js';
import { hills } from './layers/hills.js';
import { minerals } from './layers/minerals.js';
import { props } from './layers/props.js';
import { relief } from './layers/relief.js';
import { rivers } from './layers/rivers.js';
import { roads } from './layers/roads.js';
import { scene } from './layers/scene.js';
import { settlements } from './layers/settlements.js';
import { shores } from './layers/shores.js';
import { texture } from './layers/texture.js';
import { tileColors } from './layers/tile-colors.js';
import { vegetation } from './layers/vegetation.js';

/* ============================================================
   MapPainter — рисует карту целиком в один большой холст, пиксель за пикселем.

   Слои (снизу вверх):
     1. фон — цвет каждой клетки, пиксельно смешанный с соседями (дизеринг);
     2. рельеф гор — тени по карте высот; горы плавно переходят в окружающую землю;
     3. реки — с мягкой кромкой, мостами и бродами;
     4. текстура — крапинки, волны, цветы и листва на лугах;
     5. границы регионов;
     6. декорации (деревья, поля, руда, разломы) — строго снизу вверх, как в перспективе.

   Все рисунки заданы в долях клетки, поэтому размер клетки (tileSize) можно менять.
   Спрайты рассчитаны на 12 пикселей: функция px(n) переводит «пиксели для клетки 12×12» в текущий размер.
   ============================================================ */

/* ============================================================
   MapPainter
   ============================================================ */
export class MapPainter {
    constructor(map, options = {}) {
        this.map = map;
        this.options = {
            tileSize: 12,
            blendSharpness: 1.5,   // насколько резко смешиваются соседние биомы (больше — резче, 1 — очень мягко)
            coastSharpness: 1.5,   // то же для границы воды и суши — а также для берегов (песок, галька) и краёв рек
            coastScale: 1.15,      // насколько сильно скругляется берег (в клетках при tileSize 12; 0 — выключить)
            peakSharpness: 0.75,   // 0..1: острота гор (0 — округлые холмы-«губка», 1 — острые пики и гребни)
            mountainLift: 14,      // на сколько пикселей (для клетки 12×12) самые высокие горы поднимаются вверх, к северу
            hillStrength: 0.6,     // 0..1: заметность холмов и впадин на равнинах (0 — выключить)
            ravineDensity: 0.5,    // 0..1: сколько оврагов в сухих местах (0 — нет)
            grassDensity: 1,       // густота пучков травы (множитель)
            shores: true,          // пляжи, каменистые берега и утёсы
            settlements: true,     // поселения (домики)
            roads: true,           // дороги между поселениями
            settlementMinHouses: 1, // домиков в самом маленьком поселении
            settlementMaxHouses: 3, // домиков в клетке высшего уровня (если они помещаются)
            settlementOverflow: 0.25, // на сколько (доля клетки) основание дома может выйти за границу своей клетки
            spriteOutline: false,  // тёмный контур вокруг построек, руд и эфира (в стиле dark fantasy выключен)
            grade: true,           // в тёмном стиле: цветокоррекция, туман, виньетка
            vignette: 0.35,        // затемнение к краям карты в тёмном стиле (0 — нет)
            props: true,           // в тёмном стиле: кости, вороны, развалины, виселицы
            ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) // undefined не должен затирать значения по умолчанию
        };
        this.tileSize = this.options.tileSize;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.colors = {};
        for (const [name, hex] of Object.entries(COLORS)) this.colors[name] = hexToPacked(hex);
    }

    /* ---------- Главный метод ---------- */

    // view: 'terrain' | 'temperature' | 'regions'. Возвращает холст с готовой картой.
    paint({ view, seasonName, showBorders, mood }) {
        this.view = view;
        this.mood = mood === 'dark' ? 'dark' : 'light';
        this.season = (this.mood === 'dark' ? DARK_SEASONS : SEASONS)[seasonName];
        this.pal = this.season.palette;
        this.packed = packPalette(this.pal);
        this.seedSalt = ((this.map.seed | 0) * 13) % 100000; // у каждой карты свои узоры шума

        this.width = this.map.size * this.tileSize;
        this.canvas.width = this.width;
        this.canvas.height = this.width;
        const image = this.ctx.createImageData(this.width, this.width);
        this.pixels = new Int32Array(image.data.buffer); // Int32: значения помещаются в «маленькие целые», это заметно быстрее, чем Uint32
        this.waterMask = new Uint8Array(this.width * this.width); // 1 — пиксель воды (заполняется при рисовании фона)
        this.riverMask = null;
        this.relief = null;
        this.reliefHeight = null;
        this.shadeCache = new Map();
        this.tuftCache = new Map();
        this.emissive = [];   // источники света (окна, костры, эфирные разломы): рисуются после цветокоррекции, чтобы оставаться яркими
        this.buildAxisTables();

        const terrain = view === 'terrain';
        this.paintBase();
        this.smoothCoast();
        this.decorateWaterMask();
        if (terrain) {
            this.relief = this.buildReliefHeights();
            this.reliefHeight = this.relief.height;
            this.paintHills();
            this.paintShores();
            this.paintRivers();
            this.paintRoads();
            this.paintSettlementGround();
        }
        this.paintTexture();
        if (showBorders) this.paintRegionBorders();
        if (terrain) this.paintScene();

        if (terrain && this.mood === 'dark' && this.options.grade) this.applyGrading();
        for (const draw of this.emissive) draw();

        this.ctx.putImageData(image, 0, 0);
        return this.canvas;
    }

    /* ---------- Вспомогательные ---------- */

    // «Пиксели для клетки 12×12» -> пиксели текущей клетки.
    px(n) {
        return Math.round(n * this.tileSize / 12);
    }

    forEachTile(callback) {
        const size = this.map.size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) callback(x, y);
        }
    }

    // Температура клетки с учётом сезона: зимой холоднее, летом теплее.
    seasonalTemperature(i) {
        return this.map.temperature[i] + this.season.tempShift;
    }

    put(x, y, color) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.width) this.pixels[y * this.width + x] = color;
    }

    blend(x, y, color, alpha) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.width) return;
        const k = y * this.width + x;
        this.pixels[k] = mixPacked(this.pixels[k], color, alpha);
    }

    rect(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) this.put(xx, yy, color);
        }
    }

    // Пиксели отрезка (алгоритм Брезенхэма).
    linePoints(x0, y0, x1, y1) {
        const points = [];
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let error = dx + dy;
        for (;;) {
            points.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const doubled = 2 * error;
            if (doubled >= dy) { error += dy; x0 += sx; }
            if (doubled <= dx) { error += dx; y0 += sy; }
        }
        return points;
    }
}

Object.assign(MapPainter.prototype, base, coast, tileColors, hills, shores, relief, rivers, texture, grading, props, roads, settlements, minerals, borders, scene, vegetation);
