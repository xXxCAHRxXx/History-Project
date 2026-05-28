let historicalMap;
let yandexMap;
let currentYear = 1940;
let boundsData = {};
let yearInfoData = {};
let mapsIndex = null;
let currentMapKey = null;

const yearSlider = document.getElementById('yearSlider');
const yearInfo = document.getElementById('yearInfo');
const popup = document.getElementById('eventPopup');
const popupTitle = document.getElementById('popupTitle');
const popupDesc = document.getElementById('popupDescription');
const closePopup = document.querySelector('.close');

window.addEventListener('load', async () => {
    historicalMap = new HistoricalMap('historicalCanvas', 'historicalMapContainer');
    historicalMap.resizeCanvas();

    yandexMap = new YandexMapWrapper('yandexMapContainer');
    await yandexMap.init([59.95, 30.3], 12);

    try {
        const response = await fetch('data/bounds.json');
        boundsData = await response.json();
    } catch (e) {
        console.error('Не удалось загрузить bounds.json', e);
        boundsData['1940'] = {
            latMin: 59.842745,
            lonMin: 30.211887,
            latMax: 60.055416,
            lonMax: 30.512466
        };
    }

    try {
        const response = await fetch('data/year-info.json');
        yearInfoData = await response.json();
    } catch (e) {
        console.error('Не удалось загрузить year-info.json', e);
    }

    try {
        const response = await fetch('data/maps-index.json');
        if (response.ok) {
            mapsIndex = await response.json();
        }
    } catch (e) {
        console.warn('maps-index.json не найден — диапазоны лет отключены', e);
        mapsIndex = null;
    }

    yearSlider.min = 1940;
    yearSlider.max = 1960;
    yearSlider.value = currentYear;

    yearSlider.addEventListener('input', (e) => {
        const year = parseInt(e.target.value);
        if (year !== currentYear) {
            currentYear = year;
            loadYearData(year);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const newYear = currentYear - 1;
            if (newYear >= yearSlider.min) {
                yearSlider.value = newYear;
                currentYear = newYear;
                loadYearData(newYear);
            }
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const newYear = currentYear + 1;
            if (newYear <= yearSlider.max) {
                yearSlider.value = newYear;
                currentYear = newYear;
                loadYearData(newYear);
            }
        }
    });

    yearInfo.addEventListener('click', () => {
        const info = yearInfoData[currentYear];
        if (info) {
            popupTitle.textContent = info.title;
            popupDesc.textContent = info.description;
        } else {
            popupTitle.textContent = `Год ${currentYear}`;
            popupDesc.textContent = 'Нет описания для этого года.';
        }
        popup.style.display = 'flex';
    });

    await loadYearData(currentYear);

    document.getElementById('historicalMapContainer').addEventListener('pointSelected', (e) => {
        const point = e.detail;
        showEventInfo(point);
        yandexMap.showPoint(point);
        historicalMap.highlightPoint(point.id);
    });

    document.getElementById('yandexMapContainer').addEventListener('ymapsPlacemarkClick', (e) => {
        const point = e.detail;
        showEventInfo(point);
        historicalMap.showPoint(point);
    });

    closePopup.addEventListener('click', () => {
        popup.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.style.display = 'none';
        }
    });
});

function parseMapKey(key) {
    const s = String(key).trim();
    const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (m) {
        let start = parseInt(m[1], 10);
        let end = parseInt(m[2], 10);
        if (start > end) [start, end] = [end, start];
        return { start, end, key: s };
    }
    const y = parseInt(s, 10);
    return { start: y, end: y, key: s };
}

function resolveMapKey(year) {
    if (Array.isArray(mapsIndex)) {
        for (const entry of mapsIndex) {
            const { start, end } = parseMapKey(entry);
            if (year >= start && year <= end) return String(entry).trim();
        }
    }
    return String(year);
}

async function loadYearData(year) {
    yearInfo.textContent = `Год ${year}`;

    const mapKey = resolveMapKey(year);
    const dataPath = `data/${year}.json`;

    const b = boundsData[mapKey] || boundsData[year];
    if (b) {
        historicalMap.setBounds(b);
    } else {
        console.warn(`Нет границ для ${mapKey}, используются предыдущие`);
    }

    try {
        const response = await fetch(dataPath);
        if (!response.ok) throw new Error('Нет данных для этого года');
        let points = await response.json();
        points.forEach((p, idx) => { if (!p.id) p.id = `p-${year}-${idx}`; });

        if (mapKey !== currentMapKey) {
            await historicalMap.setImage(`maps/${mapKey}.png`);
            currentMapKey = mapKey;
        }

        historicalMap.setPoints(points);
        yandexMap.setPoints(points);
    } catch (error) {
        console.error(error);
        historicalMap.setPoints([]);
        yandexMap.setPoints([]);
    }
}

function showEventInfo(point) {
    popupTitle.textContent = '';

    if (point.link) {
        const a = document.createElement('a');
        a.href = point.link;
        a.textContent = point.title;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'popup-title-link';
        popupTitle.appendChild(a);
    } else {
        popupTitle.textContent = point.title;
    }

    popupDesc.textContent = point.description;
    popup.style.display = 'flex';
}