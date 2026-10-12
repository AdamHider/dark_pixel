import { CULTURE_COLORS } from '../../game/cultures.js';
import { SPRITE_EXAMPLES } from '../../sprites/sprite-examples.js';
import { COLORS } from '../painter/constants.js';

/* Армии поверх карты.

   Армия — это данные GameState (tile, faction, strength, moves), а рисует её этот слой: маркер в цвет
   фракции и, у выбранной армии, достижимая зона (куда можно дойти за очки движения) и зона контроля
   (соседние клетки, как в Total War). Достижимую зону и зону контроля считает модель — игровая логика,
   а не рисование; здесь мы только показываем результат. */

export const armies = {
    // Модель игры (GameState) — нужна, чтобы спросить reachableTiles/zoneOfControl. Можно не задавать.
    setArmyModel(model) {
        this.armyModel = model;
    },

    // Клик по маркеру армии: выделить её или, если она уже выбрана, попробовать переместить.
    selectArmy(army) {
        if (this.armySelection === army) return;
        this.armySelection = army || null;
        this.draw();
        if (this.onArmySelectionChange) this.onArmySelectionChange(this.armySelection);
    },

    clearArmySelection() {
        if (!this.armySelection) return;
        this.armySelection = null;
        this.draw();
        if (this.onArmySelectionChange) this.onArmySelectionChange(null);
    },

    // Цвет фракции — по её культуре (см. src/game/cultures.js).
    armyColor(factionId) {
        const faction = this.map.factions && this.map.factions[factionId];
        const culture = faction && faction.culture !== undefined ? faction.culture : factionId;
        return CULTURE_COLORS[((culture % CULTURE_COLORS.length) + CULTURE_COLORS.length) % CULTURE_COLORS.length];
    },

    // Центр клетки армии в координатах экрана.
    armyScreenPoint(army) {
        const tileSize = this.options.tileSize;
        const cx = (army.tile % this.map.size + 0.5) * tileSize;
        const cy = (Math.floor(army.tile / this.map.size) + 0.5) * tileSize;
        return {
            x: (cx - this.camera.x) * this.camera.zoom,
            y: (cy - this.camera.y) * this.camera.zoom
        };
    },

    // Маркер под точкой экрана (или null).
    armyAt(point) {
        const hitRadius = Math.max(8, this.options.tileSize * this.camera.zoom * 0.6);
        for (const army of this.armies) {
            const center = this.armyScreenPoint(army);
            if (Math.hypot(point.x - center.x, point.y - center.y) <= hitRadius) return army;
        }
        return null;
    },

    drawArmies() {
        if (this.armies.length === 0) return;
        const { ctx } = this;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        this.drawArmyMoveArea();
        for (const army of this.armies) this.drawArmyMarker(army);
        ctx.restore();
    },

    // Зона, куда может дойти выбранная армия, и её зона контроля.
    drawArmyMoveArea() {
        const army = this.armySelection;
        if (!army || !this.armyModel) return;
        const { ctx } = this;
        const tileSize = this.options.tileSize;
        const size = this.map.size;
        const cell = tileSize * this.camera.zoom;
        const screenX = tile => (tile * tileSize - this.camera.x) * this.camera.zoom;

        const reachable = this.armyModel.reachableTiles(army);
        ctx.fillStyle = COLORS.armyReach;
        for (const tile of reachable.keys()) {
            ctx.fillRect(screenX(tile % size), screenX(Math.floor(tile / size)), cell, cell);
        }

        // Контур зоны контроля: рисуем только внешний край, чтобы не заливать каждую клетку.
        const zone = this.armyModel.zoneOfControl(army);
        ctx.strokeStyle = COLORS.armyZoc;
        ctx.lineWidth = Math.max(1, cell * 0.12);
        for (const tile of zone) {
            const x = tile % size, y = Math.floor(tile / size);
            const left = screenX(x), top = screenX(y);
            ctx.beginPath();
            if (!zone.has(tile - 1) && x > 0) { ctx.moveTo(left, top); ctx.lineTo(left, top + cell); }
            if (!zone.has(tile + 1) && x < size - 1) { ctx.moveTo(left + cell, top); ctx.lineTo(left + cell, top + cell); }
            if (!zone.has(tile - size) && y > 0) { ctx.moveTo(left, top); ctx.lineTo(left + cell, top); }
            if (!zone.has(tile + size) && y < size - 1) { ctx.moveTo(left, top + cell); ctx.lineTo(left + cell, top + cell); }
            ctx.stroke();
        }
    },

    // Маркер армии: спрайт из конфига (src/sprites/sprite-examples.js) в цвет культуры фракции.
    drawArmyMarker(army) {
        const { ctx } = this;
        const unit = this.options.tileSize / 12;                 // спрайты нарисованы для клетки 12×12
        const config = this.armyConfig || SPRITE_EXAMPLES.army;
        const flagship = army === this.armySelection;
        const sprite = this.sprites.render(config, {
            season: this.seasonName,
            colors: { team: this.armyColor(army.faction) },
            flags: ['marching']
        });
        const zoom = this.camera.zoom;
        const [tileX, tileY] = [army.tile % this.map.size, Math.floor(army.tile / this.map.size)];
        const baseX = tileX * this.options.tileSize + this.options.tileSize / 2;
        const baseY = tileY * this.options.tileSize + this.options.tileSize * 0.9;
        const factor = unit * zoom / sprite.scale;
        const x = (baseX - this.camera.x) * zoom - sprite.anchorX * factor;
        const y = (baseY - this.camera.y) * zoom - sprite.anchorY * factor;

        if (flagship) {
            // Подсветка выбранного отряда — мягкое пятно под спрайтом.
            const { x: cx, y: cy } = this.armyScreenPoint(army);
            const radius = Math.max(8, this.options.tileSize * zoom * 0.5);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 226, 122, 0.22)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 226, 122, 0.85)';
            ctx.lineWidth = Math.max(1, zoom);
            ctx.stroke();
        }
        ctx.drawImage(sprite.canvas, x, y, sprite.width * factor, sprite.height * factor);
    },
};
