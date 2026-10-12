import { SpriteRenderer } from '../../sprites/sprite-renderer.js';
import { MapPainter } from '../painter/map-painter.js';
import { SEASONS } from '../seasons.js';
import { camera } from './camera.js';
import { input } from './input.js';
import { objects } from './objects.js';
import { selection } from './selection.js';

/* ============================================================
   MapRenderer — камера и взаимодействие с картой.
   Сама карта рисуется в MapPainter один раз в большой скрытый холст (buffer) в масштабе 1:1.
   Камера просто показывает нужный кусок этого холста с нужным зумом — поэтому двигать и зумить быстро.

   Камера: camera.x / camera.y — мировые координаты (в пикселях карты) левого верхнего угла экрана.
   ============================================================ */
export class MapRenderer {
    constructor(canvas, map, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.map = map;
        this.options = {
            tileSize: 16,          // размер клетки в пикселях (в игре всегда 16)
            minZoom: 0.1,
            maxZoom: 6,
            zoomStep: 1.15,        // во сколько раз меняется зум за один «щелчок» колеса
            keyPanStep: 60,        // шаг движения камеры стрелками, в экранных пикселях
            backgroundColor: '#0f1418',
            mood: 'dark',          // 'dark' (dark fantasy) | 'light'
            ...options
        };

        this.painter = new MapPainter(map, this.options);
        this.buffer = document.createElement('canvas'); // пока пустой; после refresh() — холст painter'а

        this.view = 'terrain';     // 'terrain' | 'temperature' | 'regions' | 'factions'
        this.seasonName = 'summer';
        this.mood = this.options.mood;
        this.showBorders = true;
        this.showFactions = true;
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.sprites = new SpriteRenderer();
        this.objects = [];         // объекты на карте: города, армии... (см. setObjects)
        this.onObjectClick = null; // функция (object) => void — клик по объекту
        this.selection = null;     // { tile, region, edges } — выделенная клетка и её регион
        this.onSelect = null;      // функция (tileInfo, regionInfo) => void
        this.onHover = null;       // функция (tileInfo | null) => void

        this.dragging = false;
        this.pressStart = null;
        this.lastPointer = { x: 0, y: 0 };

        this.bindEvents();
        new ResizeObserver(() => this.resize()).observe(canvas);
        this.resize();
    }

    /* ---------- Публичные методы ---------- */

    // Вызывать после каждой новой генерации карты.
    refresh() {
        this.selection = null;
        this.rebuildBuffer();
        this.fitToView();
    }

    setView(view) {
        this.view = view;
        this.rebuildBuffer();
        this.draw();
    }

    setSeason(name) {
        if (!SEASONS[name]) return;
        this.seasonName = name;
        this.rebuildBuffer();
        this.draw();
    }

    // 'dark' — dark fantasy (приглушённые цвета, туман, мёртвые деревья, мрачные детали); 'light' — обычный стиль.
    setMood(mood) {
        this.mood = mood;
        this.rebuildBuffer();
        this.draw();
    }

    setShowSettlements(show) {
        this.painter.options.settlements = show;
        this.rebuildBuffer();
        this.draw();
    }

    setShowBorders(show) {
        this.showBorders = show;
        this.rebuildBuffer();
        this.draw();
    }

    setShowFactions(show) {
        this.showFactions = show;
        this.rebuildBuffer();
        this.draw();
    }

    rebuildBuffer() {
        this.buffer = this.painter.paint({
            view: this.view, seasonName: this.seasonName,
            showBorders: this.showBorders, showFactions: this.showFactions, mood: this.mood
        });
    }

    /* ---------- Камера ---------- */

    get worldSize() {
        return this.map.size * this.options.tileSize;
    }

    /* ---------- Вывод на экран ---------- */

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.clampCamera();
        this.draw();
    }

    draw() {
        const { ctx, canvas, camera } = this;
        ctx.fillStyle = this.options.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (this.buffer.width === 0) return;

        // При отдалении сглаживаем (иначе мерцает), при приближении оставляем чёткие пиксели.
        ctx.imageSmoothingEnabled = camera.zoom < 1;

        // Какой кусок мира сейчас виден, обрезанный по границам карты.
        const viewW = canvas.width / camera.zoom;
        const viewH = canvas.height / camera.zoom;
        const srcX = Math.max(0, camera.x);
        const srcY = Math.max(0, camera.y);
        const srcRight = Math.min(this.worldSize, camera.x + viewW);
        const srcBottom = Math.min(this.worldSize, camera.y + viewH);
        if (srcRight <= srcX || srcBottom <= srcY) return;

        ctx.drawImage(
            this.buffer,
            srcX, srcY, srcRight - srcX, srcBottom - srcY,
            (srcX - camera.x) * camera.zoom, (srcY - camera.y) * camera.zoom,
            (srcRight - srcX) * camera.zoom, (srcBottom - srcY) * camera.zoom
        );
        this.drawSelection();
        this.drawObjects();
    }
}

Object.assign(MapRenderer.prototype, objects, camera, selection, input);
