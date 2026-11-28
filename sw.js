// Service worker of the Engpass-Wächter: keeps the app shell and the master data ready offline (cache first). It does
// not handle daily data (daten/) and foreign addresses (RKI): the page loads them itself and stores the daily data in
// the offline cache itself. So the service worker never has to go to the network without network – in WebKit it
// otherwise sometimes hung under load (see FORTSCHRITT.md, Etappe 3). Updating (issue #27): the name HUELLE is stamped
// on publishing ('ew-huelle-<commit>-<time>'). A new version loads all files past the HTTP cache (cache: 'reload') and
// then waits until the page lets it take over with postMessage({ typ: 'aktivieren' }) – nobody is interrupted while
// reading or typing. Exceptions that activate at once: first installation (no active service worker yet, otherwise no
// offline start) and the step from a version without the notice in the page (its cache does not carry the marker MARKE
// yet).
const HUELLE = 'ew-huelle-03826e5-202611281218';
const SHELL_FILES = [
    './',
    'index.html',
    'stil.css',
    'thema.js',
    'staerke.js',
    'einordnung.js',
    'oeffnungszeiten.js',
    'app.js',
    'js/choose.js',
    'js/data.js',
    'js/detail-parts.js',
    'js/detail.js',
    'js/dom.js',
    'js/guided-choice.js',
    'js/guided-result.js',
    'js/infections.js',
    'js/main.js',
    'js/matching.js',
    'js/mine.js',
    'js/mine-gestures.js',
    'js/mine-tiles.js',
    'js/more.js',
    'js/navigation.js',
    'js/news.js',
    'js/pharmacies-entry.js',
    'js/pharmacies-view.js',
    'js/pharmacies.js',
    'js/places.js',
    'js/pzn-search.js',
    'js/pzn.js',
    'js/scan.js',
    'js/search.js',
    'js/state.js',
    'js/testdata-view.js',
    'js/testdata.js',
    'js/ui.js',
    'js/update.js',
    'js/watchlist.js',
    'js/whats-new.js',
    'manifest.webmanifest',
    'pruefvertrag.json',
    'neu.json',
    'stamm/regeln.json',
    'stamm/wirkstoffe.json',
    'stamm/handelsnamen.json',
    'symbole/symbol-180.png',
    'symbole/symbol-192.png',
    'symbole/symbol-512.png',
];
// Internal marker in the cache: „this version waits for the page to release it“. Never requested from the network.
const MARKER = new URL('__ew-wartet-auf-freigabe', self.registration.scope).href;

// True when a new version may wait for the page to release it (see the header).
async function canWait() {
    // If there is an older cache with a marker, the running page understands the notice „Neue Version da.“.
    for (const k of await caches.keys()) {
        if (!k.startsWith('ew-huelle-') || k === HUELLE) continue;
        if (await (await caches.open(k)).match(MARKER)) return true;
    }
    return false;
}

// Loads all files of the shell fresh into the cache of this version.
async function install() {
    const c = await caches.open(HUELLE);
    // Every file fresh from the server, never from the HTTP cache (GitHub Pages: about 10 minutes).
    await Promise.all(
        SHELL_FILES.map(async (d) => {
            const req = new Request(new URL(d, self.registration.scope).href, { cache: 'reload' });
            const res = await fetch(req);
            if (!res.ok) throw new Error(`${d}: HTTP ${res.status}`);
            await c.put(req, res);
        }),
    );
    await c.put(
        MARKER,
        new Response(HUELLE, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    );
    if (!self.registration.active || !(await canWait())) await self.skipWaiting();
}

self.addEventListener('install', (e) => e.waitUntil(install()));
self.addEventListener('activate', (e) =>
    e.waitUntil(
        caches
            .keys()
            .then((ks) =>
                Promise.all(
                    ks
                        .filter((k) => k.startsWith('ew-huelle-') && k !== HUELLE)
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    ),
);
self.addEventListener('message', (e) => {
    if (e.data && e.data.typ === 'aktivieren') self.skipWaiting();
});

// Answers from the cache first, otherwise from the network.
async function shell(req) {
    const hits = await caches.match(req, { ignoreSearch: true });
    if (hits) return hits;
    return fetch(req);
}

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (
        url.origin !== location.origin ||
        e.request.method !== 'GET' ||
        url.pathname.includes('/daten/')
    )
        return;
    e.respondWith(shell(e.request));
});
