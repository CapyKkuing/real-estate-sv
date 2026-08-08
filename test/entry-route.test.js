import { describe, expect, it, vi } from 'vitest';
import {
    ENTRY_MODE,
    hashForEntryMode,
    readEntryMode,
    writeEntryMode,
} from '../site/entry-route.js';

describe('entry route state', () => {
    it('maps only the approved hashes to entry modes', () => {
        expect(readEntryMode('')).toBe(ENTRY_MODE.HOME);
        expect(readEntryMode('#home')).toBe(ENTRY_MODE.HOME);
        expect(readEntryMode('#housing')).toBe(ENTRY_MODE.HOUSING);
        expect(readEntryMode('#map')).toBe(ENTRY_MODE.MAP);
        expect(readEntryMode('#unknown')).toBe(ENTRY_MODE.HOME);
    });

    it('does not write the same hash twice', () => {
        const history = { pushState: vi.fn() };
        const location = { hash: '#housing' };
        writeEntryMode(history, location, ENTRY_MODE.HOUSING);
        expect(history.pushState).not.toHaveBeenCalled();

        writeEntryMode(history, location, ENTRY_MODE.MAP);
        expect(history.pushState).toHaveBeenCalledWith(null, '', '#map');
    });

    it('creates a stable hash for every mode', () => {
        expect(hashForEntryMode(ENTRY_MODE.HOME)).toBe('#home');
        expect(hashForEntryMode(ENTRY_MODE.HOUSING)).toBe('#housing');
        expect(hashForEntryMode(ENTRY_MODE.MAP)).toBe('#map');
    });
});
