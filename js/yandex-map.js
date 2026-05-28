class YandexMapWrapper {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.points = [];
        this.placemarks = [];
        this.selectedPlacemark = null;
    }

    async init(center = [59.95, 30.3], zoom = 12) {
        await ymaps.ready();
        this.map = new ymaps.Map(this.containerId, {
            center: center,
            zoom: zoom,
            controls: ['zoomControl', 'fullscreenControl']
        });

        this.map.events.add('click', (e) => {
            const coords = e.get('coords');
            this._onMapClick(coords);
        });
    }

    setPoints(points) {
        this.points = points;
        this._renderPlacemarks();
    }

    _renderPlacemarks() {
        if (this.placemarks.length) {
            this.map.geoObjects.removeAll();
            this.placemarks = [];
        }

        this.points.forEach(point => {
            const placemark = new ymaps.Placemark([point.lat, point.lon], {
                hintContent: point.title,
                balloonContent: `<strong>${point.title}</strong><br>${point.description}`
            }, {
                preset: 'islands#redIcon',
                openBalloonOnClick: true
            });

            placemark.events.add('click', (e) => {
                e.stopPropagation();
                const el = document.getElementById(this.containerId);
                if (el) {
                    el.dispatchEvent(new CustomEvent('ymapsPlacemarkClick', { detail: point }));
                }
            });

            this.placemarks.push(placemark);
            this.map.geoObjects.add(placemark);
        });
    }

    showPoint(point) {
        this.map.setCenter([point.lat, point.lon], 15);
        const placemark = this.placemarks.find(pm => pm.properties.get('hintContent') === point.title);
        if (placemark) {
            placemark.balloon.open();
        }
    }

    _onMapClick(coords) {
        const [lat, lon] = coords;
        if (!this.points.length) return;
        let minDist = Infinity;
        let nearest = null;
        this.points.forEach(point => {
            const dist = Math.hypot(point.lat - lat, point.lon - lon);
            if (dist < minDist) {
                minDist = dist;
                nearest = point;
            }
        });
        if (minDist < 0.01) {
            const el = document.getElementById(this.containerId);
            if (el) {
                el.dispatchEvent(new CustomEvent('ymapsPlacemarkClick', { detail: nearest }));
            }
        }
    }
}