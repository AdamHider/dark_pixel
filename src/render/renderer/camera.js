import { clamp } from '../../core/math.js';

/* Камера: зум, перемещение, перевод координат экрана в координаты карты */

export const camera = {
    // Показать всю карту целиком по центру.
    fitToView() {
        const zoom = Math.min(this.canvas.width, this.canvas.height) / this.worldSize;
        this.camera.zoom = clamp(zoom, this.options.minZoom, this.options.maxZoom);
        this.centerOn(this.worldSize / 2, this.worldSize / 2);
    },

    centerOn(worldX, worldY) {
        this.camera.x = worldX - this.canvas.width / 2 / this.camera.zoom;
        this.camera.y = worldY - this.canvas.height / 2 / this.camera.zoom;
        this.clampCamera();
        this.draw();
    },

    // Не даём камере улететь слишком далеко: за краем карты можно видеть не больше половины экрана.
    clampCamera() {
        const cam = this.camera;
        const viewW = this.canvas.width / cam.zoom;
        const viewH = this.canvas.height / cam.zoom;
        cam.x = clamp(cam.x, -viewW / 2, this.worldSize - viewW / 2);
        cam.y = clamp(cam.y, -viewH / 2, this.worldSize - viewH / 2);
    },

    // Сдвиг камеры на dx, dy экранных пикселей (карта «едет» вслед за пальцем/мышью).
    panBy(dx, dy) {
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.clampCamera();
        this.draw();
    },

    // Зум так, чтобы точка под курсором осталась на месте.
    zoomAt(screenX, screenY, factor) {
        const cam = this.camera;
        const worldBefore = this.screenToWorld(screenX, screenY);

        cam.zoom = clamp(cam.zoom * factor, this.options.minZoom, this.options.maxZoom);
        cam.x = worldBefore.x - screenX / cam.zoom;
        cam.y = worldBefore.y - screenY / cam.zoom;
        this.clampCamera();
        this.draw();
    },

    screenToWorld(screenX, screenY) {
        return {
            x: this.camera.x + screenX / this.camera.zoom,
            y: this.camera.y + screenY / this.camera.zoom
        };
    },

    screenToTile(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        return {
            x: Math.floor(world.x / this.options.tileSize),
            y: Math.floor(world.y / this.options.tileSize)
        };
    },
};
