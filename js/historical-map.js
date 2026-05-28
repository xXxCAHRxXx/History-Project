class HistoricalMap {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        this.bounds = {
            latMin: 59.842745,
            lonMin: 30.211887,
            latMax: 60.055416,
            lonMax: 30.512466
        };

        this.image = null;
        this.imageWidth = 0;
        this.imageHeight = 0;
        this.points = [];
        this.highlightedPoint = null;

        this.imageCache = {};   
        this._loader = null;
        this._loaderText = null;

        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.minZoom = null;
        this.maxZoom = 5;

        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.velocityX = 0;
        this.velocityY = 0;
        this.inertiaActive = false;
        this.lastMovePositions = [];
        this.inertiaFactor = 0.925;
        this.inertiaMinSpeed = 0.3;

        this._initEvents();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setBounds(bounds) {
        this.bounds = bounds;
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        if (this.image) {
            this._coverImage();
            this.draw();
        }
    }

    
    
    async setImage(imageUrl) {
        
        if (this.imageCache[imageUrl]) {
            this._applyImage(this.imageCache[imageUrl]);
            return;
        }

        this._showLoader();
        try {
            let img;
            try {
                
                img = await this._fetchImageWithProgress(imageUrl, (p) => this._updateLoaderProgress(p));
            } catch (streamErr) {
                
                console.warn('Загрузка с прогрессом не удалась, обычная загрузка', streamErr);
                img = await this._loadImage(imageUrl);
            }
            this.imageCache[imageUrl] = img;
            this._applyImage(img);
        } finally {
            this._hideLoader();
        }
    }

    _applyImage(img) {
        this.image = img;
        this.imageWidth = img.width;
        this.imageHeight = img.height;
        this._coverImage();
        this.draw();
    }

    
    
    async _fetchImageWithProgress(url, onProgress) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        
        if (!resp.body || !resp.body.getReader) {
            return this._imageFromBlob(await resp.blob());
        }

        const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total > 0 && onProgress) onProgress(received / total);
        }
        return this._imageFromBlob(new Blob(chunks));
    }

    _imageFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const objUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(objUrl); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(objUrl); reject(e); };
            img.src = objUrl;
        });
    }

    _loadImage(url) {
        return new Promise((resolve, reject) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
        });
    }

    _showLoader() {
        if (!this._loader) {
            const d = document.createElement('div');
            d.className = 'map-loader';
            d.innerHTML = '<div class="map-loader-spinner"></div><div class="map-loader-text">Загрузка карты…</div>';
            this.container.appendChild(d);
            this._loader = d;
            this._loaderText = d.querySelector('.map-loader-text');
        }
        this._loaderText.textContent = 'Загрузка карты…';
        this._loader.style.display = 'flex';
    }

    _updateLoaderProgress(p) {
        if (!this._loaderText) return;
        const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
        this._loaderText.textContent = `Загрузка карты… ${pct}%`;
    }

    _hideLoader() {
        if (this._loader) this._loader.style.display = 'none';
    }

    
    
    setPoints(pointsData) {
        this.points = pointsData || [];
        this.highlightedPoint = null;
        this.draw();
    }

    
    async loadYear(imageUrl, pointsData) {
        await this.setImage(imageUrl);
        this.setPoints(pointsData);
    }

    _computeCoverZoom() {
        if (!this.image) return 1;
        const zoomX = this.canvas.width / this.imageWidth;
        const zoomY = this.canvas.height / this.imageHeight;
        return Math.max(zoomX, zoomY, 0.1);
    }

    _coverImage() {
        if (!this.image) return;
        this.minZoom = this._computeCoverZoom();
        this.zoom = this.minZoom;
        this.offsetX = (this.imageWidth - this.canvas.width / this.zoom) / 2;
        this.offsetY = (this.imageHeight - this.canvas.height / this.zoom) / 2;
        this._clampOffset();
    }

    _clampOffset() {
        const eps = 1e-3;

        if (this.imageWidth * this.zoom <= this.canvas.width + eps) {
            this.offsetX = (this.imageWidth - this.canvas.width / this.zoom) / 2;
        } else {
            const maxOffsetX = this.imageWidth - this.canvas.width / this.zoom;
            this.offsetX = Math.max(0, Math.min(this.offsetX, maxOffsetX));
        }

        if (this.imageHeight * this.zoom <= this.canvas.height + eps) {
            this.offsetY = (this.imageHeight - this.canvas.height / this.zoom) / 2;
        } else {
            const maxOffsetY = this.imageHeight - this.canvas.height / this.zoom;
            this.offsetY = Math.max(0, Math.min(this.offsetY, maxOffsetY));
        }
    }

    _geoToImage(lat, lon) {
        const x = (lon - this.bounds.lonMin) / (this.bounds.lonMax - this.bounds.lonMin) * this.imageWidth;
        const y = (this.bounds.latMax - lat) / (this.bounds.latMax - this.bounds.latMin) * this.imageHeight;
        return { x, y };
    }

    
    
    _pointToImage(point) {
        if (typeof point.imgX === 'number' && typeof point.imgY === 'number') {
            return { x: point.imgX, y: point.imgY };
        }
        return this._geoToImage(point.lat, point.lon);
    }

    _imageToGeo(x, y) {
        const lon = this.bounds.lonMin + (x / this.imageWidth) * (this.bounds.lonMax - this.bounds.lonMin);
        const lat = this.bounds.latMax - (y / this.imageHeight) * (this.bounds.latMax - this.bounds.latMin);
        return { lat, lon };
    }

    _screenToImage(screenX, screenY) {
        const imgX = this.offsetX + screenX / this.zoom;
        const imgY = this.offsetY + screenY / this.zoom;
        return { x: imgX, y: imgY };
    }

    _imageToScreen(imgX, imgY) {
        const screenX = (imgX - this.offsetX) * this.zoom;
        const screenY = (imgY - this.offsetY) * this.zoom;
        return { x: screenX, y: screenY };
    }

    draw() {
        if (!this.image) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.drawImage(this.image, -this.offsetX, -this.offsetY);
        this.ctx.restore();

        this.points.forEach(point => {
            const { x: imgX, y: imgY } = this._pointToImage(point);
            const { x: screenX, y: screenY } = this._imageToScreen(imgX, imgY);
            if (screenX < -20 || screenX > this.canvas.width + 20 || screenY < -20 || screenY > this.canvas.height + 20) return;

            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 8, 0, 2 * Math.PI);
            this.ctx.fillStyle = point.id === this.highlightedPoint ? '#ff4500' : '#ffd700';
            this.ctx.shadowColor = 'black';
            this.ctx.shadowBlur = 5;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = '#8b0000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }

    getPointAt(screenX, screenY) {
        const threshold = 15;
        for (let point of this.points) {
            const { x: imgX, y: imgY } = this._pointToImage(point);
            const { x: px, y: py } = this._imageToScreen(imgX, imgY);
            if (Math.hypot(screenX - px, screenY - py) < threshold) return point;
        }
        return null;
    }

    highlightPoint(id) {
        this.highlightedPoint = id;
        this.draw();
    }

    
    
    showPoint(point) {
        if (!this.image) return;
        const { x: imgX, y: imgY } = this._pointToImage(point);

        
        const desiredZoom = (this.minZoom || 1) * 2.5;
        let targetZoom = Math.max(this.zoom, desiredZoom);
        targetZoom = Math.min(this.maxZoom, targetZoom);

        
        const targetOffsetX = imgX - this.canvas.width / (2 * targetZoom);
        const targetOffsetY = imgY - this.canvas.height / (2 * targetZoom);

        this._animateTo(targetOffsetX, targetOffsetY, targetZoom);
        this.highlightPoint(point.id);
    }

    _animateTo(targetOffsetX, targetOffsetY, targetZoom, duration = 450) {
        
        this.inertiaActive = false;
        this.isDragging = false;
        if (this._animFrame) cancelAnimationFrame(this._animFrame);

        const startOffsetX = this.offsetX;
        const startOffsetY = this.offsetY;
        const startZoom = this.zoom;
        const startTime = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3); 

        const step = (now) => {
            const t = Math.min(1, (now - startTime) / duration);
            const k = ease(t);
            this.zoom = startZoom + (targetZoom - startZoom) * k;
            this.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * k;
            this.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * k;
            this._clampOffset();
            this.draw();
            if (t < 1) {
                this._animFrame = requestAnimationFrame(step);
            } else {
                this._animFrame = null;
            }
        };
        this._animFrame = requestAnimationFrame(step);
    }

    _initEvents() {
        this.container.addEventListener('mousedown', this._onMouseDown.bind(this));
        this.container.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.container.addEventListener('mouseup', this._onMouseUp.bind(this));
        this.container.addEventListener('wheel', this._onWheel.bind(this));
        this.container.addEventListener('click', this._onClick.bind(this));
    }

    _onMouseDown(e) {
        this.inertiaActive = false;
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.velocityX = 0;
        this.velocityY = 0;
        this.lastMovePositions = [];
        this.container.style.cursor = 'grabbing';
    }

    _onMouseMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;

        this.offsetX -= dx / this.zoom;
        this.offsetY -= dy / this.zoom;
        this._clampOffset();
        this.draw();

        const now = Date.now();
        this.lastMovePositions.push({ x: e.clientX, y: e.clientY, time: now });
        if (this.lastMovePositions.length > 5) {
            this.lastMovePositions.shift();
        }

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    _onMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.container.style.cursor = 'grab';

        if (this.lastMovePositions.length >= 2) {
            const first = this.lastMovePositions[0];
            const last = this.lastMovePositions[this.lastMovePositions.length - 1];
            const dt = last.time - first.time;
            if (dt > 10) {
                const dx = last.x - first.x;
                const dy = last.y - first.y;

                this.velocityX = (dx / dt) * 15;
                this.velocityY = (dy / dt) * 15;
            }
        }

        const speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.inertiaMinSpeed) {
            this.inertiaActive = true;
            this._startInertia();
        }
    }

    _startInertia() {
        if (!this.inertiaActive) return;

        this.offsetX -= this.velocityX / this.zoom;
        this.offsetY -= this.velocityY / this.zoom;
        this._clampOffset();
        this.draw();

        this.velocityX *= this.inertiaFactor;
        this.velocityY *= this.inertiaFactor;

        const speed = Math.hypot(this.velocityX, this.velocityY);
        if (speed > this.inertiaMinSpeed) {
            requestAnimationFrame(() => this._startInertia());
        } else {
            this.inertiaActive = false;
        }
    }

    _onWheel(e) {
        e.preventDefault();
        this.inertiaActive = false;

        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const { x: imgX, y: imgY } = this._screenToImage(mouseX, mouseY);

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        let newZoom = this.zoom * delta;
        newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, newZoom));

        this.offsetX = imgX - mouseX / newZoom;
        this.offsetY = imgY - mouseY / newZoom;
        this.zoom = newZoom;
        this._clampOffset();
        this.draw();
    }

    _onClick(e) {
        if (this.isDragging) return;
        const rect = this.container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        
        
        if (e.shiftKey) {
            const { x: imgX, y: imgY } = this._screenToImage(mouseX, mouseY);
            const ix = Math.round(imgX);
            const iy = Math.round(imgY);
            const { lat, lon } = this._imageToGeo(imgX, imgY);
            const snippet = `"imgX": ${ix}, "imgY": ${iy}`;
            console.log(`[Калибровка] ${snippet}  (lat≈${lat.toFixed(4)}, lon≈${lon.toFixed(4)})`);
            this._showCalibrationHint(mouseX, mouseY, ix, iy);
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(snippet).catch(() => {});
            }
            return;
        }

        const point = this.getPointAt(mouseX, mouseY);
        if (point) {
            this.container.dispatchEvent(new CustomEvent('pointSelected', { detail: point }));
        }
    }

    _showCalibrationHint(screenX, screenY, imgX, imgY) {
        let hint = this.container.querySelector('.calibration-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'calibration-hint';
            hint.style.cssText = [
                'position:absolute',
                'background:#000',
                'color:#ffd700',
                'border:1px solid #ffd700',
                'padding:4px 8px',
                'font-family:monospace',
                'font-size:12px',
                'pointer-events:none',
                'z-index:50',
                'white-space:nowrap',
                'transform:translate(-50%, -150%)'
            ].join(';');
            this.container.appendChild(hint);
        }
        hint.textContent = `imgX:${imgX}  imgY:${imgY}  (скопировано)`;
        hint.style.left = screenX + 'px';
        hint.style.top = screenY + 'px';
        hint.style.display = 'block';
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => { hint.style.display = 'none'; }, 2500);
    }
}