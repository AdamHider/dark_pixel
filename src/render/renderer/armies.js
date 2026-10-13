import { CULTURE_COLORS } from '../../game/cultures.js';
import { SPRITE_EXAMPLES } from '../../sprites/sprite-examples.js';

/* Армии поверх карты.

   Армия — это данные GameState (tile, faction, strength, moves), а рисует её этот слой: маркер в цвет
   фракции. Достижимая зона и зона контроля считаются моделью и запекаются в буфер карты
   (src/render/painter/layers/army-overlay.js), а не рисуются поверх экрана — иначе они «плавали» бы
   при скролле и не совпадали с клетками. Здесь остаются только сами маркеры: они выходят за пределы
   клетки и потому рисуются спрайтами поверх карты. */

export const armies = {
    // Модель игры (GameState) — нужна, чтобы спросить reachableTiles/zoneOfControl. Можно не задавать.
    setArmyModel(model) {
        this.armyModel = model;
    },

    // Клик по маркеру армии: выделить её или, если она уже выбрана, попробовать переместить.
    selectArmy(army) {
        if (this.armySelection === army) return;
        this.armySelection = army || null;
        this.refreshArmyZone();     // пересчитать зону и перерисовать карту
        if (this.onArmySelectionChange) this.onArmySelectionChange(this.armySelection);
    },

    clearArmySelection() {
        if (!this.armySelection) return;
        this.armySelection = null;
        this.refreshArmyZone();
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
        for (const army of this.armies) this.drawArmyMarker(army);
        ctx.restore();
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
