/** Helpers de tiempo transcurrido para las tarjetas de pedido. */

export const getElapsedMinutes = (dateString) => {
    if (!dateString) return null;
    const created = new Date(dateString);
    if (Number.isNaN(created.getTime())) return null;
    return Math.floor((Date.now() - created.getTime()) / 60000);
};

export const getTimerUrgencyClass = (dateString) => {
    const minutes = getElapsedMinutes(dateString);
    if (minutes === null) return '';
    if (minutes >= 20) return 'order-time--danger';
    if (minutes >= 10) return 'order-time--warning';
    return '';
};

export const formatTimeElapsed = (dateString) => {
    const minutes = getElapsedMinutes(dateString);
    if (minutes === null) return '—';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
};
