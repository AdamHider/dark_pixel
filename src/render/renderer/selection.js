/* Выделение клетки и её региона */

export const selection = {
    // Клик выделяет клетку, а если это суша — ещё и весь её регион.
    selectAt(point) {
        const tile = this.screenToTile(point.x, point.y);
        const info = this.map.getTileInfo(tile.x, tile.y);
        if (!info) {
            this.clearSelection();
            return;
        }
        const region = this.map.getRegionInfo(info.regionId);
        this.selection = { tile: info, region, edges: region ? this.regionOutline(region) : [] };
        this.draw();
        if (this.onSelect) this.onSelect(info, region);
    },

    clearSelection() {
        if (!this.selection) return;
        this.selection = null;
        this.draw();
        if (this.onSelect) this.onSelect(null, null);
    },

    // Внешняя граница региона: отрезок для каждой стороны клетки, за которой уже другой регион (координаты — в клетках).
    regionOutline(region) {
        const { size, regionId } = this.map;
        const edges = [];
        for (const i of region.tiles) {
            const x = i % size;
            const y = Math.floor(i / size);
            if (x === 0 || regionId[i - 1] !== region.id) edges.push([x, y, x, y + 1]);
            if (x === size - 1 || regionId[i + 1] !== region.id) edges.push([x + 1, y, x + 1, y + 1]);
            if (y === 0 || regionId[i - size] !== region.id) edges.push([x, y, x + 1, y]);
            if (y === size - 1 || regionId[i + size] !== region.id) edges.push([x, y + 1, x + 1, y + 1]);
        }
        return edges;
    },

    // Рисуется поверх карты на экране, а не в буфере: выделение можно менять без перерисовки всей карты.
    drawSelection() {
        if (!this.selection) return;
        const { ctx, camera } = this;
        const tileSize = this.options.tileSize;
        const size = this.map.size;
        const cell = tileSize * camera.zoom; // размер клетки на экране
        const screenX = tileX => (tileX * tileSize - camera.x) * camera.zoom;
        const screenY = tileY => (tileY * tileSize - camera.y) * camera.zoom;
        const { tile, region, edges } = this.selection;

        ctx.save();
        ctx.lineJoin = 'round';

        if (region) {
            ctx.fillStyle = 'rgba(255, 240, 170, 0.18)';
            ctx.beginPath();
            for (const i of region.tiles) ctx.rect(screenX(i % size), screenY(Math.floor(i / size)), cell, cell);
            ctx.fill();

            ctx.beginPath();
            for (const [x1, y1, x2, y2] of edges) {
                ctx.moveTo(screenX(x1), screenY(y1));
                ctx.lineTo(screenX(x2), screenY(y2));
            }
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.strokeStyle = '#ffe27a';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 4;
        ctx.strokeRect(screenX(tile.x), screenY(tile.y), cell, cell);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX(tile.x), screenY(tile.y), cell, cell);
        ctx.restore();
    },
};
