// Updating the installed app (#27): a new version waits until the user taps „Jetzt laden“; version shown under
// „Mehr“.

import { state } from './state.js';
import { abortRequests } from './data.js';
import { $, announce } from './dom.js';
import { focusHeading } from './navigation.js';
import { whatsNew } from './whats-new.js';

// A new version installs in the background and waits. The app then shows „Neue Version da.“ at the top of the content
// (#22) and announces it through the status region; only
// „Jetzt laden“ lets it take over and reloads the page once. Never automatically.
let later = false;
let reloadRequested = false;
// Shows „Neue Version da.“ when a new version waits and the user has not chosen „Später“.
function showUpdateNotice(reg) {
    const box = $('#neue-version');
    if (!box || later || !reg.waiting || !navigator.serviceWorker.controller) return;
    if (box.hidden) announce(box.querySelector('.neue-version-text').textContent);
    box.hidden = false;
}
// Watches for a new version being installed and shows the notice when it is ready.
function watch(reg) {
    showUpdateNotice(reg);
    reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller)
                showUpdateNotice(reg);
        });
    });
}
// Asks the browser to look for a new version, when online.
function checkForUpdate(reg) {
    if (!navigator.onLine) return;
    // WebKit can also throw right here (e.g. „Context is stopped“ while the page is being replaced): never pass it on.
    try {
        reg.update().catch(() => {
            /* no network or server not reachable: next time */
        });
    } catch {
        /* next time */
    }
}
// Version from the name of the own cache ('ew-huelle-<commit>-<YYYYMMDDhhmm>' in UTC, werkzeuge/version.sh), without
// network.
async function ownVersion(reg) {
    const names = (await caches.keys()).filter((k) => k.startsWith('ew-huelle-'));
    if (!names.length) return null;
    // There are several caches only while a new version waits: then the older one is still running.
    const time = (k) => (k.match(/-(\d{12})$/) || [, ''])[1];
    names.sort((a, b) => time(a).localeCompare(time(b)));
    const name = reg && reg.waiting && names.length > 1 ? names[0] : names[names.length - 1];
    const m = name.match(/^ew-huelle-([0-9a-f]{7,40})-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return { commit: null, zeit: null };
    return { commit: m[1], zeit: new Date(Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5], +m[6])) };
}
// Shows the running version under „Mehr“.
async function renderVersion(reg) {
    const target = $('#version');
    if (!target || !self.caches) return;
    try {
        const v = await ownVersion(reg);
        if (!v) return;
        if (!v.commit) target.textContent = 'Entwicklungsstand';
        else {
            const when = new Intl.DateTimeFormat('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }).format(v.zeit);
            target.textContent = `Version ${v.commit} · ${when}`;
        }
        state.lastVersion = v;
        await whatsNew(v);
    } catch {
        /* cache not readable: no version shown */
    }
}
// Registers the service worker and the buttons of the update notice (#27).
export function registerServiceWorker() {
    // WebKit can throw synchronously here while the page is being replaced (#39): the app then starts without it.
    try {
        register();
    } catch {
        /* No service worker this time: the page still works, offline use from the next start */
    }
}
// Registration and the listeners for the update notice.
function register() {
    if ('serviceWorker' in navigator) {
        const sw = navigator.serviceWorker;
        $('#neue-version-laden').addEventListener('click', async () => {
            // #39: the registration can fail while the page is being replaced – never an unhandled rejection.
            const reg = await sw.getRegistration().catch(() => null);
            if (!reg || !reg.waiting) {
                $('#neue-version').hidden = true;
                return;
            }
            reloadRequested = true;
            reg.waiting.postMessage({ typ: 'aktivieren' });
        });
        $('#neue-version-spaeter').addEventListener('click', () => {
            later = true;
            $('#neue-version').hidden = true;
            // The focused button is gone: continue on the heading of the view, where the notice was (#22).
            const heading = [...document.querySelectorAll('#inhalt h1')].find(
                (h) => !h.closest('[hidden]'),
            );
            if (heading) focusHeading(heading);
        });
        // Reload only after „Jetzt laden“, and only once: not on the first installation (clients.claim), no loop – the
        // reloaded page has requested nothing and therefore never reloads by itself.
        sw.addEventListener('controllerchange', () => {
            if (!reloadRequested) return;
            reloadRequested = false;
            state.reloading = true;
            // #39: own requests end as a handled abort, not stopped by WebKit half-way through the reload.
            abortRequests();
            location.reload();
        });
        sw.register('sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                watch(reg);
                // At start the browser checks the version itself (on every page load, past the HTTP cache with
                // updateViaCache: 'none'). An extra update() at start let parallel page requests in WebKit without
                // network bypass the service worker (8 of 60 offline starts failed; without it: as before).
                renderVersion(reg);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') checkForUpdate(reg);
                });
                sw.addEventListener('controllerchange', () => renderVersion(reg));
                document
                    .querySelector('[data-tab="mehr"]')
                    .addEventListener('click', () => renderVersion(reg));
            })
            .catch(() => {});
    }
}
