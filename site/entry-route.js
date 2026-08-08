export const ENTRY_MODE = Object.freeze({
    HOME: 'home',
    HOUSING: 'housing',
    MAP: 'map',
});

const VALID_MODES = new Set(Object.values(ENTRY_MODE));

export function readEntryMode(hash) {
    const mode = String(hash || '').replace(/^#/, '');
    return VALID_MODES.has(mode) ? mode : ENTRY_MODE.HOME;
}

export function hashForEntryMode(mode) {
    return `#${VALID_MODES.has(mode) ? mode : ENTRY_MODE.HOME}`;
}

export function writeEntryMode(history, location, mode) {
    const hash = hashForEntryMode(mode);
    if (location.hash !== hash) history.pushState(null, '', hash);
}
