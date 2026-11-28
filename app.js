// Engpass-Wächter – prototype web app (no dependencies, no build step). Entry module: registers the service
// worker and starts the app (#56). Data: the mirrored BfArM shortage reports (daten/), the substance list from Wikidata
// (stamm/) and optionally RKI figures. Everything personal stays on this device.

import { start } from './js/main.js';
import { registerServiceWorker } from './js/update.js';

registerServiceWorker();
// An error at start must never end as an unhandled error (e.g. „Context is stopped“ while WebKit replaces the page).
start().catch(() => {
    /* Page is being replaced or storage is not usable: nothing more to do */
});
