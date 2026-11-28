// Scanning the PZN from the pack with the camera (#43, small trial): the barcode „PZN - 12345678“ is Code 39 with
// „-“ before the 8 digits. Own reader in plain JavaScript – no library, no WebAssembly, no new host. The camera picture
// is only read on the device, frame by frame, and never stored or sent. Typing the PZN always stays possible.

import { announce, el, t } from './dom.js';
import { pznValid } from './matching.js';
import { sym } from './ui.js';

// Code 39: 43 characters, each 9 elements (bar, space, bar, …), 3 of them wide; bit 8 = first element, 1 = wide.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const CODES = [
    0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148,
    0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052,
    0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4,
    0x0a8, 0x0a2, 0x08a, 0x02a,
];
const START_STOP = 0x094;
const CHAR_BY_CODE = new Map(CODES.map((c, i) => [c, ALPHABET[i]]));
// Wide elements must be clearly wider than narrow ones (the standard allows 2 : 1 to 3 : 1). Compared on the means of
// the 3 widest and the 6 narrowest elements (#82): real camera pictures blur single elements (narrow 5–7 px, wide
// 10–12 px), which a rule on single values rejected.
const MIN_WIDE_RATIO = 1.5;
// Below this difference between dark and light a line holds no barcode.
const MIN_CONTRAST = 40;

// The 9-bit code of 9 element widths, or -1 when they are no clean Code 39 character. The 3 widest count as wide when
// their mean is at least 1.5 × the mean of the 6 others; the cut lies between the 6th and the 7th width.
function codeOf(widths) {
    const sorted = [...widths].sort((a, b) => a - b);
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
    if (mean(sorted.slice(6)) < mean(sorted.slice(0, 6)) * MIN_WIDE_RATIO) return -1;
    const cut = (sorted[5] + sorted[6]) / 2;
    return widths.reduce((code, w) => (code << 1) | (w > cut ? 1 : 0), 0);
}
// Run lengths of dark and light along a line of brightness values, starting with the first dark run.
function runsOf(line) {
    let min = 255;
    let max = 0;
    for (const v of line) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (max - min < MIN_CONTRAST) return [];
    const middle = (min + max) / 2;
    const runs = [];
    let dark = null;
    for (const v of line) {
        const d = v < middle;
        if (dark === null) {
            if (!d) continue;
            dark = true;
            runs.push(0);
        } else if (d !== dark) {
            dark = d;
            runs.push(0);
        }
        runs[runs.length - 1]++;
    }
    return runs;
}
// Reads the text of a Code 39 barcode from the runs (even index = bar), or null. A pack upside down is read by passing
// the runs of the line read backwards.
function readRuns(runs) {
    for (let i = 0; i + 9 <= runs.length; i += 2) {
        if (codeOf(runs.slice(i, i + 9)) !== START_STOP) continue;
        let text = '';
        for (let j = i + 10; j + 9 <= runs.length; j += 10) {
            const code = codeOf(runs.slice(j, j + 9));
            if (code === START_STOP) {
                if (text) return text;
                break;
            }
            const char = CHAR_BY_CODE.get(code);
            if (!char) break;
            text += char;
        }
    }
    return null;
}
// The PZN in the text of the barcode: „-12345678“ (PZN-8) or „-1234567“ (old PZN-7, which becomes PZN-8 with a leading
// 0). Only with a valid check digit, so a misread never ends up in the field.
export function pznFromCode39(text) {
    const m = /^(?:PZN)?-?(\d{7,8})$/.exec(String(text || ''));
    if (!m) return null;
    const p = m[1].length === 7 ? `0${m[1]}` : m[1];
    return pznValid(p) ? p : null;
}
// Brightness of one pixel of RGBA image data.
const luminance = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
// Rows and columns that are read: from 20 % to 80 % of the picture in steps of 3 % (#82) – a barcode held anywhere in
// the frame is crossed by several lines.
const FIRST_LINE = 20;
const LAST_LINE = 80;
const LINE_STEP = 3;
// Looks for a PZN barcode in a picture (ImageData): rows and columns, in both directions. A PZN counts only when two
// lines agree, and only with a valid check digit.
export function pznFromImage(image) {
    const { width, height, data } = image;
    const lines = [];
    for (let k = FIRST_LINE; k <= LAST_LINE; k += LINE_STEP) {
        const y = Math.floor((height * k) / 100);
        lines.push(Array.from({ length: width }, (_, x) => luminance(data, (y * width + x) * 4)));
        const x = Math.floor((width * k) / 100);
        lines.push(
            Array.from({ length: height }, (_, y2) => luminance(data, (y2 * width + x) * 4)),
        );
    }
    const seen = new Map();
    for (const line of lines)
        for (const direction of [line, [...line].reverse()]) {
            const p = pznFromCode39(readRuns(runsOf(direction)));
            if (!p) continue;
            seen.set(p, (seen.get(p) || 0) + 1);
            if (seen.get(p) >= 2) return p;
        }
    return null;
}

// Width of the picture that is examined: enough for a barcode across, small enough to stay quick.
const FRAME_WIDTH = 720;
const FRAME_EVERY_MS = 200;
// True when this browser can show the camera at all (otherwise the button is not offered).
export const canScan = () =>
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);

// Opens the camera sheet; calls found(pzn) once a PZN was read. Escape, „Abbrechen“ or a tap outside close it, and the
// camera is switched off right away. The rest of the page is inert while the sheet is open.
export function openScanner(found, returnFocus) {
    let stream = null;
    let timer = null;
    let closed = false;
    const video = el('video', {
        class: 'scan-bild',
        playsinline: '',
        muted: '',
        autoplay: '',
        'aria-hidden': 'true',
    });
    const message = el('p', { class: 'leise', id: 'scan-hinweis' }, t('scanHinweis'));
    const canvas = document.createElement('canvas');
    // Switches the camera off and removes the sheet.
    const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (stream) for (const track of stream.getTracks()) track.stop();
        video.srcObject = null;
        // Drop the last frame from memory as well.
        canvas.width = 0;
        canvas.height = 0;
        sheet.remove();
        for (const id of ['inhalt', 'dock']) {
            const part = document.getElementById(id);
            if (part) part.inert = false;
        }
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('popstate', close);
        window.removeEventListener('pagehide', close);
        if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    };
    // Leaving the app (other app, locked screen) switches the camera off right away.
    const onHidden = () => {
        if (document.visibilityState === 'hidden') close();
    };
    // Escape closes the sheet.
    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };
    const cancel = el(
        'button',
        { type: 'button', class: 'link-knopf', 'data-testid': 'scan-abbrechen', onclick: close },
        t('scanAbbrechen'),
    );
    const sheet = el(
        'div',
        {
            class: 'blatt-hintergrund',
            onclick: (e) => {
                if (e.target === e.currentTarget) close();
            },
        },
        el(
            'div',
            {
                class: 'blatt',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'scan-titel',
                'aria-describedby': 'scan-hinweis',
                'data-testid': 'scan-blatt',
            },
            el('h2', { class: 'zwischentitel', id: 'scan-titel', tabindex: '-1' }, t('scanTitel')),
            el('div', { class: 'scan-rahmen' }, video),
            message,
            el('p', { class: 'hinweis-info' }, sym('info'), el('span', {}, t('scanPrivat'))),
            cancel,
        ),
    );
    document.body.append(sheet);
    for (const id of ['inhalt', 'dock']) {
        const part = document.getElementById(id);
        if (part) part.inert = true;
    }
    document.addEventListener('keydown', onKey);
    // Focus on the title (#22): at large text the picture stays in view, „Abbrechen“ follows below.
    sheet.querySelector('#scan-titel').focus();
    // The back gesture, leaving the page or the app: never keep the camera running in the background.
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('popstate', close);
    window.addEventListener('pagehide', close);
    // Shows why the camera is not available; typing stays possible.
    const fail = () => {
        if (closed) return;
        // Calm, not red: nothing went wrong on the person's side, typing works (#43, design review).
        message.replaceChildren(sym('info'), el('span', {}, t('scanKeineKamera')));
        message.className = 'hinweis-info';
        announce(t('scanKeineKamera'));
    };
    // Reads one frame of the camera picture and closes the sheet when a PZN was found.
    const look = () => {
        if (closed || !video.videoWidth) return;
        const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.drawImage(video, 0, 0, canvas.width, canvas.height);
        const p = pznFromImage(g.getImageData(0, 0, canvas.width, canvas.height));
        if (!p) return;
        close();
        found(p);
    };
    navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then((s) => {
            if (closed) {
                for (const track of s.getTracks()) track.stop();
                return;
            }
            stream = s;
            video.srcObject = s;
            const playing = video.play();
            if (playing && playing.catch) playing.catch(() => {});
            timer = setInterval(look, FRAME_EVERY_MS);
        })
        .catch(fail);
    return close;
}
