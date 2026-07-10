import { describe, it, expect } from 'vitest';
import { getElapsedMinutes, getTimerUrgencyClass, formatTimeElapsed } from '@/shared/utils/formatters';

describe('formatters timer', () => {
    it('getElapsedMinutes devuelve minutos enteros transcurridos', () => {
        const fiftyMinAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
        expect(getElapsedMinutes(fiftyMinAgo)).toBe(50);
    });

    it('getElapsedMinutes devuelve null para fechas inválidas', () => {
        expect(getElapsedMinutes('')).toBe(null);
        expect(getElapsedMinutes(null)).toBe(null);
        expect(getElapsedMinutes(undefined)).toBe(null);
        expect(getElapsedMinutes('fecha-no-valida')).toBe(null);
    });

    it('getTimerUrgencyClass: <10 min es neutro', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        expect(getTimerUrgencyClass(fiveMinAgo)).toBe('');
    });

    it('getTimerUrgencyClass: 10-20 min es warning', () => {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        expect(getTimerUrgencyClass(fifteenMinAgo)).toBe('order-time--warning');
    });

    it('getTimerUrgencyClass: >=20 min es danger', () => {
        const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        expect(getTimerUrgencyClass(twentyMinAgo)).toBe('order-time--danger');
    });

    it('getTimerUrgencyClass: 65 horas es danger', () => {
        const sixtyFiveHoursAgo = new Date(Date.now() - 65 * 60 * 60 * 1000).toISOString();
        expect(getElapsedMinutes(sixtyFiveHoursAgo)).toBe(3900);
        expect(getTimerUrgencyClass(sixtyFiveHoursAgo)).toBe('order-time--danger');
    });

    it('formatTimeElapsed formatea minutos y horas', () => {
        const fiftyMinAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
        const sixtyFiveHoursAgo = new Date(Date.now() - 65 * 60 * 60 * 1000).toISOString();
        expect(formatTimeElapsed(fiftyMinAgo)).toBe('50m');
        expect(formatTimeElapsed(sixtyFiveHoursAgo)).toBe('65h');
    });

    it('formatTimeElapsed devuelve em-dash para fechas inválidas', () => {
        expect(formatTimeElapsed('')).toBe('—');
    });
});
