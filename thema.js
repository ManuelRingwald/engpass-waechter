// Engpass-Wächter – applies the chosen light/dark theme before the first paint (choice stored only on this device).
// Loaded as a blocking script in <head>; moved out of index.html so the Content-Security-Policy needs no inline
// scripts (#51).
'use strict';
try {
    const choice = localStorage.getItem('ew.thema');
    if (choice === '"hell"' || choice === '"dunkel"') {
        document.documentElement.dataset.theme = JSON.parse(choice);
    }
} catch {
    // Storage not available: keep the system theme.
}
