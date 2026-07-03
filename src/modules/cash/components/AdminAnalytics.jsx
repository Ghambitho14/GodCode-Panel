import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowUpRight, ArrowDownRight, Calendar,
    ShoppingBag, Users, DollarSign, CreditCard,
    Smartphone, TrendingUp, Package, Clock, MapPin, Truck,
    BarChart3, AreaChart, Wallet, Banknote, Download, Loader2, Plus, Eye, ExternalLink
} from 'lucide-react';
import { supabase, TABLES } from '@/integrations/supabase';
import { cashService } from '../services/cashService';
import { expenseBucketKey, expenseBucketKeysForRange, labelForExpenseBucket } from '../utils/cashExpenseBuckets';
import {
    labelForManualExpenseKind,
    isCashWithdrawal,
    isOperatingLocalExpense,
    isOrderLinkedExpense,
    EXPENSE_KIND_OPERATING,
} from '../utils/cashMovementKinds';
import AdminIconSlot from './AdminIconSlot';
import AdminMenuSelect from './AdminMenuSelect';
import ReportPeriodSelect from './ReportPeriodSelect';
import {
    addLocalDays,
    CUSTOM_DAY_MENU_VALUE,
    formatReportPeriodLabel,
    getReportPeriodOptions,
    isCustomDayPeriod,
    isInReportRange,
    parseCustomDay,
    reportPeriodExportSlug,
    resolveReportPeriodRange,
    ymdLocal,
} from '../utils/reportPeriodRange';
import { createMoneyFormatter } from '@/shared/utils/money';
import { resolveEffectiveCountry, resolveEffectiveCurrency } from '@/lib/geo/tenant-locale';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { isMenuOrder, getOrderPaymentBreakdown, getPaymentLabel, ORDERS_ANALYTICS_METRICS_SELECT, ORDERS_EXPORT_SELECT } from '@/shared/utils/orderUtils';
import { fetchTopProducts, fetchAnalyticsSummary } from '../services/analyticsService';
import {
    countOrdersInRange,
    confirmLargeExport,
    MONTHLY_EXPORT_DISCLAIMER,
} from '../services/analyticsExportUtils';
import { fetchAllPaginated } from '@/shared/utils/fetchAllPaginated';
import { downloadExcel, openSpreadsheetInNewTab } from '@/shared/utils/exportUtils';
import SpreadsheetPreviewModal from './SpreadsheetPreviewModal';
import { isValidBranchId } from '@/shared/utils/safeIds';
import { useAdmin } from '../admin/pages/AdminProvider';
import LocalExpenseModal from './expenses/LocalExpenseModal';
import RPTSalesLightweightChart from './charts/RPTSalesLightweightChart';
import RPTRosenBarChart from './charts/RPTRosenBarChart';
import RPTRosenDonutChart from './charts/RPTRosenDonutChart';

const CHART_KIND_OPTIONS = [
    { value: 'area', label: 'Área', Icon: AreaChart },
    { value: 'bar-solid', label: 'Barras', Icon: BarChart3 },
    { value: 'bar-gradient', label: 'Barras degradado', Icon: BarChart3 },
];

function calcTrendPercent(current, prev) {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100);
}

function formatSalesChartLabel(isoDate, dayCount) {
    const d = new Date(`${isoDate}T12:00:00`);
    if (dayCount <= 15) {
        return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'numeric' });
}

const EXPENSE_AGG_OPTIONS = [
    { value: 'day', label: 'Día' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
];

const EXPENSE_PERIOD_TABS = [
    { value: 'month', label: 'Mes actual' },
    { value: '7', label: '7 días' },
    { value: '30', label: '30 días' },
    { value: 'week', label: 'Semana' },
];

const EXPENSE_PERIOD_TAB_VALUES = new Set(EXPENSE_PERIOD_TABS.map((o) => o.value));

const EXPENSE_PERIOD_MORE_OPTIONS = getReportPeriodOptions().filter(
    (o) => !EXPENSE_PERIOD_TAB_VALUES.has(o.value),
);

function isExpensePeriodTab(value) {
    return EXPENSE_PERIOD_TAB_VALUES.has(value);
}

/** Rango UTC half-open [start, end) para un mes calendario `yyyy-mm`. */
function getMonthRangeUtc(yyyyMm) {
    const [yearStr, monthStr] = String(yyyyMm).split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const nextMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    return {
        startIso: start.toISOString(),
        endIso: nextMonth.toISOString(),
    };
}

function formatCalendarMonthLabel(yyyyMm) {
    const [yearStr, monthStr] = String(yyyyMm).split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return yyyyMm;
    }
    return new Date(year, month - 1, 1).toLocaleDateString('es-CL', {
        month: 'long',
        year: 'numeric',
    });
}

function currentMonthYyyyMm(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Rango local [start, end) para un año calendario completo. */
function getCalendarYearRangeLocal(year) {
    if (!Number.isFinite(year)) return null;
    return {
        start: new Date(year, 0, 1),
        end: new Date(year + 1, 0, 1),
    };
}

function resolveExpenseReferenceYear(analyticsDate, reportRange) {
    if (reportRange.end instanceof Date && !Number.isNaN(reportRange.end.getTime())) {
        const probe = addLocalDays(reportRange.end, -1);
        return probe.getFullYear();
    }
    if (reportRange.chartDateKeys?.length) {
        const last = reportRange.chartDateKeys[reportRange.chartDateKeys.length - 1];
        const year = Number(String(last).split('-')[0]);
        if (Number.isFinite(year)) return year;
    }
    if (reportRange.start instanceof Date && !Number.isNaN(reportRange.start.getTime())) {
        return reportRange.start.getFullYear();
    }
    const year = Number(String(analyticsDate).split('-')[0]);
    if (Number.isFinite(year)) return year;
    return new Date().getFullYear();
}


const TrendBadge = ({ value }) => {
    if (value === 0) return <span className="rpt-trend neutral">0%</span>;
    const pos = value > 0;
    return (
        <span className={`rpt-trend ${pos ? 'positive' : 'negative'}`}>
            {pos ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
            {Math.abs(value)}%
        </span>
    );
};

function buildExpenseChartData(rows, expenseAgg, bucketKeys) {
    const acc = new Map();
    for (const row of rows || []) {
        const iso = row.created_at;
        if (!iso) continue;
        const key = expenseBucketKey(iso, expenseAgg);
        acc.set(key, (acc.get(key) || 0) + (Number(row.amount) || 0));
    }
    const keys = bucketKeys?.length ? bucketKeys : [...acc.keys()].sort();
    return {
        expenseBucketsOrdered: keys.map((k) => ({
            key: k,
            label: labelForExpenseBucket(k, expenseAgg),
            total: acc.get(k) || 0,
        })),
        expenseBarPoints: keys.map((k) => ({
            key: k,
            label: labelForExpenseBucket(k, expenseAgg),
            value: Number(acc.get(k)) || 0,
        })),
        periodTotal: keys.reduce((sum, k) => sum + (Number(acc.get(k)) || 0), 0),
    };
}

/** Rango local [start, end) para gráficos/tablas de gastos según período del informe. */
function resolveFromReportRange(reportRange) {
    let start = reportRange.start;
    let end = reportRange.end;

    if (!start && reportRange.chartDateKeys?.length) {
        const [y, mo, d] = reportRange.chartDateKeys[0].split('-').map(Number);
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
            start = new Date(y, mo - 1, d);
        }
    }

    if (!end && reportRange.chartDateKeys?.length) {
        const last = reportRange.chartDateKeys[reportRange.chartDateKeys.length - 1];
        const [y, mo, d] = last.split('-').map(Number);
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
            end = addLocalDays(new Date(y, mo - 1, d), 1);
        }
    }

    if (!start || !end) {
        return null;
    }

    return { start, end };
}

function resolveExpenseChartRange(reportRange, expenseAgg, analyticsDate) {
    if (expenseAgg === 'month') {
        const year = resolveExpenseReferenceYear(analyticsDate, reportRange);
        return getCalendarYearRangeLocal(year);
    }
    return resolveFromReportRange(reportRange);
}

function resolveTopProductsRange(reportRange) {
    if (reportRange?.start) {
        return {
            startIso: reportRange.start.toISOString(),
            endIso: reportRange.end
                ? reportRange.end.toISOString()
                : new Date().toISOString(),
        };
    }
    const keys = reportRange?.chartDateKeys;
    if (keys?.length) {
        const start = new Date(`${keys[0]}T00:00:00`);
        const end = new Date(`${keys[keys.length - 1]}T23:59:59.999`);
        end.setDate(end.getDate() + 1);
        return {
            startIso: start.toISOString(),
            endIso: end.toISOString(),
        };
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 364);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** `orders` desde el panel sigue limitado a 100 filas (kanban). Los KPIs usan fetch propio vía `analyticsOrders`. */
const AdminAnalytics = ({ orders, clients, branches, showNotify, companyId, selectedBranch, view = 'full' }) => {
    const { formatMoney: fmt, currency } = useMemo(
        () => createMoneyFormatter(selectedBranch, companyProfile),
        [selectedBranch, companyProfile],
    );

    const multiCurrencyWarning = useMemo(() => {
        if (selectedBranch?.id !== 'all') return null;
        const realBranches = (branches || []).filter((b) => b.id && b.id !== 'all');
        if (realBranches.length < 2) return null;
        const currencies = new Set(
            realBranches.map((b) => resolveEffectiveCurrency(b, companyProfile)),
        );
        if (currencies.size <= 1) return null;
        return `Las sucursales usan monedas distintas (${[...currencies].join(', ')}). Los totales no convierten entre monedas.`;
    }, [selectedBranch?.id, branches, companyProfile]);

    const exportIdLabel = useMemo(() => {
        const country = selectedBranch?.id === 'all'
            ? companyProfile?.country
            : resolveEffectiveCountry(selectedBranch, companyProfile);
        return getFormStrategy(country).idName;
    }, [selectedBranch, companyProfile]);
    const [filterPeriod, setFilterPeriod] = useState(() => (view === 'expensesOnly' ? 'month' : '7'));
    const [chartTab, setChartTab] = useState('all');
    const [chartKind, setChartKind] = useState('bar-gradient');
    /** Pestaña principal del bloque informe: ventas (gráfico + barra lateral) o gastos del local. */
    const [expensesData, setExpensesData] = useState({ total: 0, prevTotal: 0 });
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [manualExpenseRows, setManualExpenseRows] = useState([]);
    const [refundExpenseRows, setRefundExpenseRows] = useState([]);
    const [expenseAgg, setExpenseAgg] = useState('day');
    const [exportExpensesLoading, setExportExpensesLoading] = useState(false);
    const [analyticsDate, setAnalyticsDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [exportLoading, setExportLoading] = useState(false);
    /** Pedidos del rango para KPIs/gráficos (fallback client-side). */
    const [analyticsOrders, setAnalyticsOrders] = useState([]);
    const [analyticsSummary, setAnalyticsSummary] = useState(null);
    /** @type {'rpc' | 'fallback' | 'none'} */
    const [analyticsSource, setAnalyticsSource] = useState('none');
    const [loadingAnalyticsOrders, setLoadingAnalyticsOrders] = useState(false);
    const [topProductsFromRpc, setTopProductsFromRpc] = useState([]);
    const [loadingTopProducts, setLoadingTopProducts] = useState(false);
    const [expenseRefreshNonce, setExpenseRefreshNonce] = useState(0);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    const [expensePreviewState, setExpensePreviewState] = useState(null);
    /** @type {'all' | 'operating' | 'cash_withdrawal' | 'order_refund'} */
    const [expenseKindFilter, setExpenseKindFilter] = useState('all');
    const { cashSystem, moveOrder, companyProfile } = useAdmin();

    const reportRange = useMemo(
        () => resolveReportPeriodRange(filterPeriod),
        [filterPeriod],
    );

    const expenseChartRange = useMemo(
        () => resolveExpenseChartRange(reportRange, expenseAgg, analyticsDate),
        [reportRange, expenseAgg, analyticsDate],
    );

    const expenseReferenceYear = useMemo(
        () => resolveExpenseReferenceYear(analyticsDate, reportRange),
        [analyticsDate, reportRange],
    );

    const expenseCustomDay = parseCustomDay(filterPeriod) ?? ymdLocal(new Date());
    const currentMonthBucketKey = currentMonthYyyyMm();

    const expenseBucketKeys = useMemo(() => {
        if (!expenseChartRange) return [];
        return expenseBucketKeysForRange(expenseChartRange.start, expenseChartRange.end, expenseAgg);
    }, [expenseChartRange, expenseAgg]);

    useEffect(() => {
        if (!companyId || view === 'expensesOnly') {
            if (view === 'expensesOnly') {
                setAnalyticsSummary(null);
                setAnalyticsSource('none');
                setAnalyticsOrders([]);
                setLoadingAnalyticsOrders(false);
            }
            return;
        }
        let cancelled = false;
        setLoadingAnalyticsOrders(true);
        (async () => {
            try {
                const startIso = reportRange.start?.toISOString() ?? null;
                const endIso = reportRange.end?.toISOString() ?? null;
                const prevStartIso =
                    reportRange.hasComparison && reportRange.prevStart
                        ? reportRange.prevStart.toISOString()
                        : null;
                const prevEndIso =
                    reportRange.hasComparison && reportRange.prevEnd
                        ? reportRange.prevEnd.toISOString()
                        : null;
                const channel =
                    chartTab === 'online' ? 'online' : chartTab === 'store' ? 'store' : 'all';

                const { summary, error, notGranted } = await fetchAnalyticsSummary({
                    companyId,
                    branchId: selectedBranch?.id,
                    startIso,
                    endIso,
                    prevStartIso,
                    prevEndIso,
                    channel,
                    showNotify,
                });

                if (cancelled) return;

                if (summary && !error && !notGranted) {
                    setAnalyticsSummary(summary);
                    setAnalyticsSource('rpc');
                    setAnalyticsOrders([]);
                    return;
                }

                const fallbackStartIso =
                    prevStartIso ?? reportRange.fetchStartIso ?? startIso ?? null;
                const fallbackEndIso = endIso ?? reportRange.fetchEndIso ?? null;

                let q = supabase
                    .from(TABLES.orders)
                    .select(ORDERS_ANALYTICS_METRICS_SELECT)
                    .eq('company_id', companyId);
                if (fallbackStartIso) {
                    q = q.gte('created_at', fallbackStartIso);
                }
                if (fallbackEndIso) {
                    q = q.lt('created_at', fallbackEndIso);
                }
                if (selectedBranch?.id && selectedBranch.id !== 'all') {
                    q = q.eq('branch_id', selectedBranch.id);
                }
                const data = await fetchAllPaginated(
                    q.order('created_at', { ascending: false }),
                );
                if (cancelled) return;
                setAnalyticsSummary(null);
                setAnalyticsSource('fallback');
                setAnalyticsOrders(data);
            } catch (e) {
                console.error('Error fetching analytics orders:', e);
                if (!cancelled) {
                    setAnalyticsSummary(null);
                    setAnalyticsSource('none');
                    setAnalyticsOrders([]);
                }
            } finally {
                if (!cancelled) setLoadingAnalyticsOrders(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        companyId,
        selectedBranch?.id,
        reportRange.start?.getTime(),
        reportRange.end?.getTime(),
        reportRange.prevStart?.getTime(),
        reportRange.prevEnd?.getTime(),
        reportRange.hasComparison,
        reportRange.fetchStartIso,
        reportRange.fetchEndIso,
        chartTab,
        view,
        showNotify,
    ]);

    useEffect(() => {
        if (!companyId) {
            setTopProductsFromRpc([]);
            return;
        }
        let cancelled = false;
        setLoadingTopProducts(true);
        const { startIso, endIso } = resolveTopProductsRange(reportRange);
        (async () => {
            try {
                const rows = await fetchTopProducts({
                    companyId,
                    branchId: selectedBranch?.id,
                    startIso,
                    endIso,
                    limit: 5,
                    showNotify,
                });
                if (!cancelled) setTopProductsFromRpc(rows);
            } catch (e) {
                console.error('Error fetching top products:', e);
                if (!cancelled) setTopProductsFromRpc([]);
            } finally {
                if (!cancelled) setLoadingTopProducts(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        companyId,
        selectedBranch?.id,
        reportRange.start?.getTime(),
        reportRange.end?.getTime(),
        reportRange.chartDateKeys?.join(','),
        showNotify,
    ]);

    useEffect(() => {
        if (!companyId) {
            setAnalyticsOrders(Array.isArray(orders) ? orders : []);
            setLoadingAnalyticsOrders(false);
        }
    }, [companyId, orders]);

    const ordersForAnalytics = useMemo(() => {
        if (analyticsSource !== 'fallback') return [];
        if (loadingAnalyticsOrders && analyticsOrders.length === 0 && Array.isArray(orders) && orders.length > 0) {
            return orders;
        }
        return analyticsOrders;
    }, [analyticsSource, loadingAnalyticsOrders, analyticsOrders, orders]);

    const branchNameById = useMemo(() => {
        const map = {};
        (branches || []).forEach((b) => {
            if (b?.id != null) map[String(b.id)] = b.name || b.label || String(b.id);
        });
        return map;
    }, [branches]);

    const operatingExpenseRows = useMemo(
        () => (manualExpenseRows || []).filter((r) => isOperatingLocalExpense(r)),
        [manualExpenseRows],
    );

    const withdrawalExpenseRows = useMemo(
        () => (manualExpenseRows || []).filter((r) => isCashWithdrawal(r)),
        [manualExpenseRows],
    );

    const operatingChartData = useMemo(
        () => buildExpenseChartData(operatingExpenseRows, expenseAgg, expenseBucketKeys),
        [operatingExpenseRows, expenseAgg, expenseBucketKeys],
    );

    const withdrawalChartData = useMemo(
        () => buildExpenseChartData(withdrawalExpenseRows, expenseAgg, expenseBucketKeys),
        [withdrawalExpenseRows, expenseAgg, expenseBucketKeys],
    );

    const refundChartData = useMemo(
        () => buildExpenseChartData(refundExpenseRows, expenseAgg, expenseBucketKeys),
        [refundExpenseRows, expenseAgg, expenseBucketKeys],
    );

    const manualExpenseBreakdown = useMemo(() => {
        const rows = manualExpenseRows || [];
        let operating = 0;
        let operatingCount = 0;
        let withdrawals = 0;
        let withdrawalCount = 0;
        for (const row of rows) {
            const amount = Number(row.amount) || 0;
            if (isCashWithdrawal(row)) {
                withdrawals += amount;
                withdrawalCount += 1;
            } else if (isOperatingLocalExpense(row)) {
                operating += amount;
                operatingCount += 1;
            }
        }
        return { operating, operatingCount, withdrawals, withdrawalCount };
    }, [manualExpenseRows]);

    const refundBreakdown = useMemo(() => {
        const rows = refundExpenseRows || [];
        let total = 0;
        for (const row of rows) {
            total += Number(row.amount) || 0;
        }
        return { total, count: rows.length };
    }, [refundExpenseRows]);

    const filteredManualExpenseRows = useMemo(() => {
        if (expenseKindFilter === 'order_refund') {
            return refundExpenseRows || [];
        }
        const rows = manualExpenseRows || [];
        if (expenseKindFilter === 'cash_withdrawal') {
            return rows.filter((r) => isCashWithdrawal(r));
        }
        if (expenseKindFilter === 'operating') {
            return rows.filter((r) => isOperatingLocalExpense(r));
        }
        return [...rows, ...(refundExpenseRows || [])];
    }, [manualExpenseRows, refundExpenseRows, expenseKindFilter]);

    const showOperatingExpenseBlock =
        expenseKindFilter === 'all' || expenseKindFilter === 'operating';
    const showWithdrawalExpenseBlock =
        expenseKindFilter === 'all' || expenseKindFilter === 'cash_withdrawal';
    const showRefundExpenseBlock =
        expenseKindFilter === 'all' || expenseKindFilter === 'order_refund';

    const expenseKindFilterOptions = useMemo(
        () => [
            {
                value: 'all',
                label: 'Todos',
                count: (manualExpenseRows?.length || 0) + (refundExpenseRows?.length || 0),
            },
            {
                value: 'operating',
                label: 'Gastos operativos',
                count: manualExpenseBreakdown.operatingCount,
            },
            {
                value: 'cash_withdrawal',
                label: 'Retiros caja',
                count: manualExpenseBreakdown.withdrawalCount,
            },
            {
                value: 'order_refund',
                label: 'Devoluciones',
                count: refundBreakdown.count,
            },
        ],
        [manualExpenseRows, refundExpenseRows, manualExpenseBreakdown, refundBreakdown],
    );

    const handleExportManualExpensesExcel = async () => {
        if (exportExpensesLoading) return;
        const exportRows = [...(manualExpenseRows || []), ...(refundExpenseRows || [])];
        if (!exportRows.length) {
            if (showNotify) showNotify('No hay gastos del local en este período', 'info');
            return;
        }
        setExportExpensesLoading(true);
        try {
            const rows = [...exportRows].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            const dataToExport = rows.map((row) => {
                const sh = row[TABLES.cash_shifts] || row.cash_shifts;
                const bid = sh?.branch_id;
                const branchName = bid != null ? (branchNameById[String(bid)] || String(bid)) : '';
                const d = new Date(row.created_at);
                const pm = row.payment_method;
                const metodo =
                    pm === 'cash' ? 'Efectivo' : pm === 'card' ? 'Tarjeta' : pm === 'online' ? 'Transferencia' : String(pm || '');
                return {
                    Fecha: d.toLocaleDateString('es-CL'),
                    Hora: d.toLocaleTimeString('es-CL'),
                    Tipo: labelForManualExpenseKind(row),
                    Sucursal: branchName,
                    Monto: row.amount,
                    Metodo: metodo,
                    Descripcion: row.description || '',
                };
            });
            const tag = reportPeriodExportSlug(filterPeriod);
            downloadExcel(dataToExport, `Gastos_local_${tag}.xls`);
            if (showNotify) showNotify('Excel de gastos generado', 'success');
        } catch {
            if (showNotify) showNotify('Error al exportar gastos', 'error');
        } finally {
            setExportExpensesLoading(false);
        }
    };

    const buildMonthlyManualExpensesExportData = useCallback(async () => {
        if (!companyId) return null;
        const range = getMonthRangeUtc(analyticsDate);
        if (!range) {
            if (showNotify) showNotify('Mes inválido', 'error');
            return null;
        }
        const rows = await cashService.getManualExpenseMovementsInRange({
            companyId,
            branchId: selectedBranch?.id,
            startIso: range.startIso,
            endIso: range.endIso,
        });
        if (!rows.length) {
            if (showNotify) showNotify('No hay gastos del local en ese mes', 'info');
            return null;
        }
        const sorted = [...rows].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const dataToExport = sorted.map((row) => {
            const sh = row[TABLES.cash_shifts] || row.cash_shifts;
            const bid = sh?.branch_id;
            const branchName = bid != null ? (branchNameById[String(bid)] || String(bid)) : '';
            const d = new Date(row.created_at);
            const pm = row.payment_method;
            const metodo =
                pm === 'cash' ? 'Efectivo' : pm === 'card' ? 'Tarjeta' : pm === 'online' ? 'Transferencia' : String(pm || '');
            return {
                Fecha: d.toLocaleDateString('es-CL'),
                Hora: d.toLocaleTimeString('es-CL'),
                Tipo: labelForManualExpenseKind(row),
                Sucursal: branchName,
                Monto: row.amount,
                Metodo: metodo,
                Descripcion: row.description || '',
            };
        });
        const [year, month] = String(analyticsDate).split('-');
        return {
            rows: dataToExport,
            filename: `Gastos_local_${year || '0000'}_${month || '00'}.xls`,
            title: `Gastos del local — ${analyticsDate}`,
        };
    }, [companyId, analyticsDate, selectedBranch?.id, branchNameById, showNotify]);

    const runMonthlyManualExpensesExport = useCallback(async (action) => {
        if (exportExpensesLoading || !companyId) return;
        setExportExpensesLoading(true);
        try {
            const result = await buildMonthlyManualExpensesExportData();
            if (!result) return;
            const { rows, filename, title } = result;
            if (action === 'modal') {
                setExpensePreviewState({ rows, filename, title });
            } else if (action === 'tab') {
                const opened = openSpreadsheetInNewTab(rows);
                if (!opened && showNotify) {
                    showNotify('Permite ventanas emergentes para ver en pestaña', 'info');
                }
            } else if (action === 'download') {
                downloadExcel(rows, filename);
                if (showNotify) showNotify('Excel de gastos del mes generado', 'success');
            }
        } catch {
            if (showNotify) showNotify('Error al exportar gastos del mes', 'error');
        } finally {
            setExportExpensesLoading(false);
        }
    }, [exportExpensesLoading, companyId, buildMonthlyManualExpensesExportData, showNotify]);

    const tryOpenRegisterExpenseModal = useCallback(() => {
        if (!selectedBranch?.id || selectedBranch.id === 'all' || !isValidBranchId(selectedBranch.id)) {
            if (showNotify) showNotify('Selecciona una sucursal para registrar un movimiento.', 'info');
            return;
        }
        if (!cashSystem?.activeShift) {
            if (showNotify) showNotify('Abre la caja en esta sucursal para registrar movimientos del local.', 'info');
            return;
        }
        setIsAddExpenseModalOpen(true);
    }, [selectedBranch, cashSystem?.activeShift, showNotify]);

    const handleExpenseMorePeriodChange = useCallback((next) => {
        if (next === CUSTOM_DAY_MENU_VALUE) {
            setFilterPeriod(`day:${ymdLocal(new Date())}`);
            return;
        }
        setFilterPeriod(String(next));
    }, []);

    const handleExpenseCustomDayChange = useCallback((e) => {
        const ymd = e.target.value;
        if (ymd) setFilterPeriod(`day:${ymd}`);
    }, []);

    const handleAfterExpenseMovement = useCallback(async () => {
        setExpenseRefreshNonce((n) => n + 1);
        if (typeof cashSystem.refresh === 'function') {
            await cashSystem.refresh();
        }
    }, [cashSystem]);

    const handleConfirmRegisterLocalExpense = useCallback(
        async (type, amount, description, paymentMethod) => {
            return cashSystem.addManualMovement(type, amount, description, paymentMethod, {
                expenseKind: EXPENSE_KIND_OPERATING,
                successMessage: 'Gasto del local registrado',
            });
        },
        [cashSystem],
    );

    const handleExportMonthlyExcel = async () => {
        if (exportLoading) return;
        const range = getMonthRangeUtc(analyticsDate);
        if (!range) {
            if (showNotify) showNotify('Mes inválido', 'error');
            return;
        }

        setExportLoading(true);
        try {
            const orderCount = await countOrdersInRange({
                companyId,
                branchId: selectedBranch?.id,
                startIso: range.startIso,
                endIso: range.endIso,
            });
            if (orderCount === 0) {
                if (showNotify) showNotify('No hay datos para exportar en este período', 'info');
                return;
            }
            if (!confirmLargeExport(orderCount)) {
                return;
            }

            let query = supabase
                .from(TABLES.orders)
                .select(ORDERS_EXPORT_SELECT)
                .gte('created_at', range.startIso)
                .lt('created_at', range.endIso)
                .order('created_at', { ascending: true });

            if (companyId) {
                query = query.eq('company_id', companyId);
            }

            if (selectedBranch && selectedBranch.id && selectedBranch.id !== 'all') {
                query = query.eq('branch_id', selectedBranch.id);
            }

            const fullMonthOrders = await fetchAllPaginated(query);

            if (!fullMonthOrders || fullMonthOrders.length === 0) {
                if (showNotify) showNotify('No hay datos para exportar en este período', 'info');
                return;
            }

            const branchById = Object.fromEntries(
                (branches || [])
                    .filter((b) => b?.id && b.id !== 'all')
                    .map((b) => [String(b.id), b]),
            );

            const dataToExport = fullMonthOrders.map(order => {
                const d = new Date(order.created_at);
                let items = Array.isArray(order.items) ? order.items : [];
                if (typeof order.items === 'string') {
                    try { items = JSON.parse(order.items); } catch {}
                }
                const itemsText = items.map(i => `${i.quantity}x ${i.name}`).join(' | ');
                const orderBranch = branchById[String(order.branch_id)] ?? null;
                const orderCurrency = resolveEffectiveCurrency(orderBranch, companyProfile);
                return {
                    Fecha: d.toLocaleDateString('es-CL'),
                    Hora: d.toLocaleTimeString('es-CL'),
                    Cliente: order.client_name,
                    [exportIdLabel]: order.client_rut,
                    Teléfono: order.client_phone,
                    Items: itemsText,
                    Total: order.total,
                    Moneda: orderCurrency,
                    'Método Pago': getPaymentLabel(order) || '',
                    'Ref. Pago': order.payment_ref || ''
                };
            });

            const [year, month] = String(analyticsDate).split('-');
            downloadExcel(dataToExport, `Reporte_${year || '0000'}_${month || '00'}.xls`);
            if (showNotify) showNotify('Reporte Excel generado', 'success');
        } catch (err) {
            if (showNotify) showNotify('Error al generar reporte: ' + (err instanceof Error ? err.message : String(err)), 'error');
        } finally {
            setExportLoading(false);
        }
    };

    /**
     * Gastos manuales del local (`expense` sin `order_id`). Rango según período del informe.
     */
    useEffect(() => {
        let cancelled = false;

        const fetchExpenses = async () => {
            setLoadingExpenses(true);
            try {
                let startIso;
                let endIso;
                let prevStartIso;
                let prevEndIso;

                if (expenseAgg === 'month') {
                    const year = resolveExpenseReferenceYear(analyticsDate, reportRange);
                    const yearRange = getCalendarYearRangeLocal(year);
                    if (!yearRange) {
                        if (!cancelled) {
                            setManualExpenseRows([]);
                            setRefundExpenseRows([]);
                            setExpensesData({ total: 0, prevTotal: 0 });
                        }
                        return;
                    }
                    startIso = yearRange.start.toISOString();
                    endIso = yearRange.end.toISOString();
                    const prevYearRange = getCalendarYearRangeLocal(year - 1);
                    if (prevYearRange) {
                        prevStartIso = prevYearRange.start.toISOString();
                        prevEndIso = prevYearRange.end.toISOString();
                    }
                } else {
                    startIso = reportRange.start?.toISOString();
                    endIso = reportRange.end?.toISOString();
                    if (reportRange.hasComparison && reportRange.prevStart && reportRange.prevEnd) {
                        prevStartIso = reportRange.prevStart.toISOString();
                        prevEndIso = reportRange.prevEnd.toISOString();
                    }
                }

                const fetchParams = {
                    companyId: companyId || null,
                    branchId: selectedBranch?.id,
                    startIso,
                    endIso,
                };

                const currentRows = await cashService.getManualExpenseMovementsInRange(fetchParams);
                const currentRefunds = await cashService.getOrderRefundMovementsInRange(fetchParams);
                if (cancelled) return;

                let prevRows = [];
                let prevRefunds = [];
                if (prevStartIso != null && prevEndIso != null) {
                    const prevParams = {
                        companyId: companyId || null,
                        branchId: selectedBranch?.id,
                        startIso: prevStartIso,
                        endIso: prevEndIso,
                    };
                    [prevRows, prevRefunds] = await Promise.all([
                        cashService.getManualExpenseMovementsInRange(prevParams),
                        cashService.getOrderRefundMovementsInRange(prevParams),
                    ]);
                }
                if (cancelled) return;

                const total = currentRows.reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
                    + currentRefunds.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
                const prevTotal = prevRows.reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
                    + prevRefunds.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
                setManualExpenseRows(currentRows);
                setRefundExpenseRows(currentRefunds);
                setExpensesData({ total, prevTotal });
            } catch (err) {
                console.error('Error fetching expenses for analytics:', err);
                if (!cancelled) {
                    setManualExpenseRows([]);
                    setRefundExpenseRows([]);
                    setExpensesData({ total: 0, prevTotal: 0 });
                }
            } finally {
                if (!cancelled) setLoadingExpenses(false);
            }
        };

        fetchExpenses();
        return () => {
            cancelled = true;
        };
    }, [reportRange, companyId, selectedBranch?.id, analyticsDate, expenseRefreshNonce, expenseAgg]);

    // --- CORE DATA ---
    const { salesChartPoints, kpis, trends, paymentBreakdown, branchStats } = useMemo(() => {
        const emptyResult = {
            salesChartPoints: [],
            kpis: { total: 0, count: 0, ticket: 0, deliveryTotal: 0, deliveryCount: 0, net: -(expensesData.total || 0) },
            trends: { total: 0, count: 0, delivery: 0, expenses: 0, net: 0 },
            paymentBreakdown: { cash: 0, card: 0, online: 0 },
            branchStats: [],
        };

        const buildExpensesByDate = (chartDateKeys) => {
            const expensesByDate = {};
            chartDateKeys.forEach((k) => {
                expensesByDate[k] = 0;
            });
            for (const row of manualExpenseRows || []) {
                const iso = row.created_at;
                if (!iso) continue;
                const localDate = new Date(iso).toLocaleDateString('en-CA');
                if (expensesByDate[localDate] !== undefined) {
                    expensesByDate[localDate] += Number(row.amount) || 0;
                }
            }
            return expensesByDate;
        };

        if (analyticsSource === 'rpc' && analyticsSummary) {
            const range = reportRange;
            const cur = analyticsSummary.current;
            const prev = analyticsSummary.prev;
            const chartDateKeys = [...range.chartDateKeys];
            const expensesByDate = buildExpensesByDate(chartDateKeys);
            const totalSales = cur.totalSales;
            const count = cur.orderCount;
            const ticket = count > 0 ? totalSales / count : 0;
            const prevSales = prev.totalSales;
            const prevCount = prev.orderCount;
            const totalNet = totalSales - (expensesData.total || 0);
            const prevNet = prevSales - (expensesData.prevTotal || 0);
            const realBranches = (branches || []).filter((b) => b.id && b.id !== 'all');
            const branchNameLookup = {};
            realBranches.forEach((b) => {
                branchNameLookup[b.id] = b.name || 'Sucursal sin nombre';
            });
            const sortedBranches = cur.byBranch
                .map((b) => ({
                    id: b.branchId,
                    name:
                        branchNameLookup[b.branchId] ||
                        (b.branchId === '_sin_asignar_' ? 'Sin asignar' : 'Sucursal eliminada'),
                    total: b.total,
                    count: b.count,
                }))
                .filter((b) => b.total > 0 || b.count > 0)
                .sort((a, b) => b.total - a.total);

            return {
                salesChartPoints: chartDateKeys.map((k) => ({
                    key: k,
                    label: formatSalesChartLabel(k, range.dayCount),
                    sales: Number(cur.byDay[k]) || 0,
                    expenses: Number(expensesByDate[k]) || 0,
                })),
                kpis: {
                    total: totalSales,
                    count,
                    ticket,
                    deliveryTotal: cur.deliveryTotal,
                    deliveryCount: cur.deliveryCount,
                    net: totalNet,
                },
                trends: {
                    total: calcTrendPercent(totalSales, prevSales),
                    count: calcTrendPercent(count, prevCount),
                    delivery: calcTrendPercent(cur.deliveryTotal, prev.deliveryTotal),
                    expenses: !expensesData.prevTotal
                        ? expensesData.total > 0
                            ? 100
                            : 0
                        : Math.round(
                              ((expensesData.total - expensesData.prevTotal) / expensesData.prevTotal) * 100,
                          ),
                    net: calcTrendPercent(totalNet, prevNet),
                },
                paymentBreakdown: { ...cur.paymentBreakdown },
                branchStats: sortedBranches,
            };
        }

        if (!ordersForAnalytics || ordersForAnalytics.length === 0) {
            return emptyResult;
        }
        const range = reportRange;
        const prevRange = {
            start: range.prevStart,
            end: range.prevEnd,
        };

        const filterByTab = (o) => {
            if (chartTab === 'all') return true;
            if (chartTab === 'online') return isMenuOrder(o);
            if (chartTab === 'store') return !isMenuOrder(o);
            return true;
        };

        const valid = ordersForAnalytics.filter(o => o.status !== 'cancelled');
        
        // [FIX] Crear Set de IDs válidos para filtrar órdenes huérfanas ("Sin asignar")
        const validBranchIds = new Set((branches || []).map(b => b.id));
        
        const current = valid.filter(o => {
            const d = new Date(o.created_at);
            const matchesTime = isInReportRange(d, range) && filterByTab(o);
            return matchesTime;
        });

        const prev = valid.filter(o => {
            const d = new Date(o.created_at);
            const matchesTime = range.hasComparison && isInReportRange(d, prevRange) && filterByTab(o);
            return matchesTime && o.branch_id && validBranchIds.has(o.branch_id);
        });

        // --- CHART DATA (serie diaria local YYYY-MM-DD) ---
        const salesByDate = {};
        const chartDateKeys = [...range.chartDateKeys];

        chartDateKeys.forEach((key) => {
            salesByDate[key] = 0;
        });

        current.forEach(o => {
            // [FIX] Convertir created_at (UTC) a fecha local del navegador para agrupar correctamente
            const localDate = new Date(o.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD local
            if (salesByDate[localDate] !== undefined) {
                salesByDate[localDate] += Number(o.total);
            }
        });

        const expensesByDate = buildExpensesByDate(chartDateKeys);

        // --- KPIS ---
        const totalSales = current.reduce((a, o) => a + Number(o.total), 0);
        const count = current.length;
        const ticket = count > 0 ? totalSales / count : 0;

        const prevSales = prev.reduce((a, o) => a + Number(o.total), 0);
        const prevCount = prev.length;

        const totalNet = totalSales - (expensesData.total || 0);
        const prevNet = prevSales - (expensesData.prevTotal || 0);

        // --- DELIVERY: solo suma `delivery_fee` (no el total del pedido). Valor = cobro envíos del período.
        const deliveryOrdersCurrent = current.filter((o) => {
            const fee = Number(o?.delivery_fee);
            return Number.isFinite(fee) && fee > 0;
        });
        const deliveryCount = deliveryOrdersCurrent.length;
        const totalDeliveryFees = deliveryOrdersCurrent.reduce(
            (a, o) => a + Number(o.delivery_fee),
            0
        );
        const prevTotalDeliveryFees = prev
            .filter((o) => {
                const fee = Number(o?.delivery_fee);
                return Number.isFinite(fee) && fee > 0;
            })
            .reduce((a, o) => a + Number(o.delivery_fee), 0);
        const trendDelivery =
            prevTotalDeliveryFees === 0
                ? totalDeliveryFees > 0
                    ? 100
                    : 0
                : Math.round(
                      ((totalDeliveryFees - prevTotalDeliveryFees) / prevTotalDeliveryFees) * 100
                  );

        // --- PAYMENT BREAKDOWN (incl. mixtos y payment_method_specific del menú) ---
        const pb = { cash: 0, card: 0, online: 0 };
        current.forEach((o) => {
            const breakdown = getOrderPaymentBreakdown(o);
            pb.cash += breakdown.cash;
            pb.card += breakdown.card;
            pb.online += breakdown.online;
        });

        // --- BRANCH BREAKDOWN ---
        const bStats = {};
        const realBranches = (branches || []).filter(b => b.id && b.id !== 'all');
        realBranches.forEach(b => {
            bStats[b.id] = { id: b.id, name: b.name || 'Sucursal sin nombre', total: 0, count: 0 };
        });
        
        current.forEach(o => {
            const bid = o.branch_id || '_sin_asignar_';
            if (!bStats[bid]) {
                // [ROBUSTEZ] Manejo seguro de sucursales eliminadas o antiguas
                const branchName = realBranches.find(b => b.id === bid)?.name || (bid === '_sin_asignar_' ? 'Sin asignar' : 'Sucursal eliminada');
                bStats[bid] = {
                    id: bid,
                    name: branchName,
                    total: 0,
                    count: 0
                };
            }
            bStats[bid].total += Number(o.total);
            bStats[bid].count += 1;
        });

        const sortedBranches = Object.values(bStats)
            .filter(b => b.total > 0 || b.count > 0)
            .sort((a, b) => b.total - a.total);

        return {
            salesChartPoints: chartDateKeys.map((k) => ({
                key: k,
                label: formatSalesChartLabel(k, range.dayCount),
                sales: Number(salesByDate[k]) || 0,
                expenses: Number(expensesByDate[k]) || 0,
            })),
            kpis: {
                total: totalSales,
                count,
                ticket,
                deliveryTotal: totalDeliveryFees,
                deliveryCount,
                net: totalNet
            },
            trends: {
                total: prevSales === 0 ? (totalSales > 0 ? 100 : 0) : Math.round(((totalSales - prevSales) / prevSales) * 100),
                count: prevCount === 0 ? (count > 0 ? 100 : 0) : Math.round(((count - prevCount) / prevCount) * 100),
                delivery: trendDelivery,
                expenses: !expensesData.prevTotal ? (expensesData.total > 0 ? 100 : 0) : Math.round(((expensesData.total - expensesData.prevTotal) / expensesData.prevTotal) * 100),
                net: !prevNet ? (totalNet !== 0 ? 100 : 0) : Math.round(((totalNet - prevNet) / prevNet) * 100)
            },
            paymentBreakdown: pb,
            branchStats: sortedBranches
        };
    }, [analyticsSource, analyticsSummary, ordersForAnalytics, reportRange, chartTab, branches, expensesData, manualExpenseRows]);

    // --- NEW CLIENTS ---
    const newClientsInfo = useMemo(() => {
        if (!clients) return { count: 0, trend: 0, total: 0 };
        const range = reportRange;
        const prevRange = { start: range.prevStart, end: range.prevEnd };
        
        const currentNew = clients.filter((c) => isInReportRange(new Date(c.created_at || new Date()), range)).length;
        const prevNew = range.hasComparison
            ? clients.filter((c) => isInReportRange(new Date(c.created_at || new Date()), prevRange)).length
            : 0;

        return {
            count: currentNew,
            trend: prevNew === 0 ? (currentNew > 0 ? 100 : 0) : Math.round(((currentNew - prevNew) / prevNew) * 100),
            total: clients.length,
        };
    }, [clients, reportRange]);

    // --- TOP 5 PRODUCTS (RPC server-side) ---
    const topProducts = topProductsFromRpc;

    // --- PEAK HOUR ---
    const peakHour = useMemo(() => {
        if (analyticsSource === 'rpc' && analyticsSummary) {
            const hourCounts = analyticsSummary.current.byHour || {};
            const sorted = Object.entries(hourCounts).sort(([, a], [, b]) => b - a);
            if (sorted.length === 0) return null;
            const h = parseInt(sorted[0][0], 10);
            return { hour: `${h}:00 - ${h + 1}:00`, count: sorted[0][1] };
        }

        if (!ordersForAnalytics || ordersForAnalytics.length === 0) return null;
        
        const hourCounts = {};
        ordersForAnalytics.filter(o => o.status !== 'cancelled' && isInReportRange(new Date(o.created_at), reportRange))
            .forEach(o => {
                const h = new Date(o.created_at).getHours();
                hourCounts[h] = (hourCounts[h] || 0) + 1;
            });

        const sorted = Object.entries(hourCounts).sort(([, a], [, b]) => b - a);
        if (sorted.length === 0) return null;
        
        const h = parseInt(sorted[0][0]);
        return { hour: `${h}:00 - ${h + 1}:00`, count: sorted[0][1] };
    }, [analyticsSource, analyticsSummary, ordersForAnalytics, reportRange]);


    const activeChartKind =
        chartKind === 'bar-gradient'
            ? 'bar-gradient'
            : chartKind === 'bar-solid' || chartKind === 'bar'
              ? 'bar-solid'
              : 'area';

    const reportPeriodHeader = (
        <header className="rpt-header rpt-header--actions-only">
            <div className="rpt-header-actions">
                <ReportPeriodSelect
                    className="rpt-period-menu-select"
                    value={filterPeriod}
                    onChange={setFilterPeriod}
                    aria-label="Rango de fechas del informe"
                    icon={<Calendar size={18} strokeWidth={1.65} className="text-accent" />}
                />
            </div>
        </header>
    );

    const gastosLocalSection = (
        <div className={`rpt-chart-card rpt-expenses-card${view === 'expensesOnly' ? ' rpt-chart-card--expenses-solo' : ''}${expenseKindFilter !== 'all' ? ' rpt-chart-card--expenses-filtered' : ''}`}>
            <div className="rpt-chart-header rpt-expenses-card-header">
                <div className="rpt-expenses-title-block">
                    <h3>Gastos del local</h3>
                    <p className="rpt-expenses-subtitle">
                        Mercadería, arriendo, sueldo y gastos operativos. Los retiros de efectivo hechos en Caja también
                        aparecen aquí para control del CEO.
                    </p>
                </div>
                <div className="rpt-expenses-toolbar">
                    <button type="button" className="rpt-btn-register-expense" onClick={tryOpenRegisterExpenseModal}>
                        <Plus size={17} strokeWidth={2.25} aria-hidden />
                        Registrar movimiento
                    </button>
                    <button
                        type="button"
                        className="rpt-tab rpt-tab--export-expenses"
                        onClick={handleExportManualExpensesExcel}
                        disabled={exportExpensesLoading || !(manualExpenseRows.length || refundExpenseRows.length)}
                    >
                        {exportExpensesLoading ? (
                            <Loader2 size={14} className="rpt-expenses-spin" aria-hidden />
                        ) : (
                            <Download size={14} aria-hidden />
                        )}
                        <span>Excel (vista)</span>
                    </button>
                </div>
            </div>
            <div className="rpt-expenses-controls">
                <div className="rpt-expenses-controls-row rpt-expenses-controls-row--period">
                    <div className="rpt-expenses-toolbar-cluster rpt-expenses-toolbar-cluster--compact" aria-label="Período y agrupación de gastos">
                        <div className="rpt-expenses-period-bar">
                            <span className="rpt-expenses-period-label">Período</span>
                            <div className="rpt-expenses-period-tabs" role="group" aria-label="Período del informe">
                                {EXPENSE_PERIOD_TABS.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`rpt-tab${filterPeriod === value ? ' active' : ''}`}
                                        onClick={() => setFilterPeriod(value)}
                                        aria-pressed={filterPeriod === value}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <AdminMenuSelect
                                className={`rpt-expenses-period-more admin-branch-select${
                                    !isExpensePeriodTab(filterPeriod) || isCustomDayPeriod(filterPeriod)
                                        ? ' rpt-expenses-period-more--active'
                                        : ''
                                }`}
                                value={
                                    isCustomDayPeriod(filterPeriod)
                                        ? CUSTOM_DAY_MENU_VALUE
                                        : isExpensePeriodTab(filterPeriod)
                                          ? 'yesterday'
                                          : filterPeriod
                                }
                                displayLabel={
                                    isExpensePeriodTab(filterPeriod) && !isCustomDayPeriod(filterPeriod)
                                        ? 'Más'
                                        : formatReportPeriodLabel(filterPeriod, getReportPeriodOptions())
                                }
                                isOptionActive={(optValue) => {
                                    if (isExpensePeriodTab(filterPeriod) && !isCustomDayPeriod(filterPeriod)) {
                                        return false;
                                    }
                                    if (optValue === CUSTOM_DAY_MENU_VALUE) {
                                        return isCustomDayPeriod(filterPeriod);
                                    }
                                    return String(optValue) === String(filterPeriod);
                                }}
                                options={EXPENSE_PERIOD_MORE_OPTIONS}
                                onChange={handleExpenseMorePeriodChange}
                                menuMinWidth={180}
                                aria-label="Más períodos"
                            />
                            {isCustomDayPeriod(filterPeriod) ? (
                                <input
                                    type="date"
                                    className="rpt-period-day-input rpt-expenses-day-input"
                                    value={expenseCustomDay}
                                    onChange={handleExpenseCustomDayChange}
                                    aria-label="Día específico"
                                />
                            ) : null}
                            {expenseAgg === 'month' ? (
                                <span className="rpt-expenses-year-label">Año {expenseReferenceYear}</span>
                            ) : null}
                        </div>
                        <div className="rpt-expenses-toolbar-divider" aria-hidden />
                        <div className="rpt-expenses-agg" role="group" aria-label="Agrupar gastos por">
                            <span className="rpt-expenses-agg-label">Agrupar</span>
                            <div className="rpt-expenses-agg-tabs">
                                {EXPENSE_AGG_OPTIONS.map(({ value, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`rpt-tab ${expenseAgg === value ? 'active' : ''}`}
                                        onClick={() => setExpenseAgg(value)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="rpt-expenses-controls-row rpt-expenses-controls-row--kinds">
                    <span className="rpt-expenses-kind-label">Tipo</span>
                    <div className="rpt-expenses-kind-filter" role="group" aria-label="Filtrar por tipo de egreso">
                        {expenseKindFilterOptions.map(({ value, label, count }) => (
                            <button
                                key={value}
                                type="button"
                                className={`rpt-tab${expenseKindFilter === value ? ' active' : ''}`}
                                onClick={() => setExpenseKindFilter(value)}
                                aria-pressed={expenseKindFilter === value}
                            >
                                <span>{label}</span>
                                {count > 0 ? (
                                    <span className="rpt-expenses-kind-count" aria-hidden>
                                        {count}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {(manualExpenseRows.length > 0 || refundExpenseRows.length > 0) && expenseKindFilter === 'all' ? (
                <p className="rpt-expenses-breakdown">
                    Total período: <strong>{fmt(expensesData.total)}</strong>
                    {' · '}
                    Operativos: <strong>{fmt(manualExpenseBreakdown.operating)}</strong> (
                    {manualExpenseBreakdown.operatingCount})
                    {' · '}
                    Retiros caja: <strong>{fmt(manualExpenseBreakdown.withdrawals)}</strong> (
                    {manualExpenseBreakdown.withdrawalCount})
                    {' · '}
                    Devoluciones: <strong>{fmt(refundBreakdown.total)}</strong> ({refundBreakdown.count})
                </p>
            ) : null}
            <div className="rpt-expenses-blocks">
                {showOperatingExpenseBlock ? (
                <section className="rpt-expenses-block">
                    <div className="rpt-expenses-block-head">
                        <h4 className="rpt-expenses-section-title">Gastos operativos</h4>
                        <span className="rpt-expenses-block-meta">
                            {manualExpenseBreakdown.operatingCount} mov. ·{' '}
                            {fmt(manualExpenseBreakdown.operating)}
                        </span>
                    </div>
                    <div className="rpt-expenses-split">
                        <div className="rpt-chart-wrapper rpt-chart-wrapper--rosen rpt-expenses-chart-wrap">
                            {operatingChartData.expenseBarPoints.length ? (
                                <RPTRosenBarChart
                                    points={operatingChartData.expenseBarPoints}
                                    height={220}
                                    ariaLabel="Gastos operativos por período"
                                    currency={currency}
                                />
                            ) : (
                                <div className="rpt-empty rpt-expenses-empty-chart">
                                    {loadingExpenses
                                        ? 'Cargando…'
                                        : 'Sin gastos operativos en este período.'}
                                </div>
                            )}
                        </div>
                        <div className="rpt-expense-panel rpt-expense-panel--totals">
                            <table className="rpt-expense-table">
                                <thead>
                                    <tr>
                                        <th>Período</th>
                                        <th className="rpt-expense-table__num">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {operatingChartData.expenseBucketsOrdered.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="rpt-expense-table__empty">
                                                Sin datos agregados.
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                            {operatingChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={
                                                        expenseAgg === 'month' &&
                                                        row.key === currentMonthBucketKey
                                                            ? 'rpt-expense-table__current-month'
                                                            : undefined
                                                    }
                                                >
                                                    <td>{row.label}</td>
                                                    <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                        {fmt(row.total)}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="rpt-expense-table__total-row">
                                                <td>Total</td>
                                                <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                    {fmt(operatingChartData.periodTotal)}
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
                ) : null}

                {showWithdrawalExpenseBlock ? (
                <section className="rpt-expenses-block rpt-expenses-block--withdrawals">
                    <div className="rpt-expenses-block-head">
                        <h4 className="rpt-expenses-section-title">Retiros de caja</h4>
                        <span className="rpt-expenses-block-meta">
                            {manualExpenseBreakdown.withdrawalCount} mov. ·{' '}
                            {fmt(manualExpenseBreakdown.withdrawals)}
                        </span>
                    </div>
                    <div className="rpt-expenses-split">
                        <div className="rpt-chart-wrapper rpt-chart-wrapper--rosen rpt-expenses-chart-wrap">
                            {withdrawalChartData.expenseBarPoints.length ? (
                                <RPTRosenBarChart
                                    points={withdrawalChartData.expenseBarPoints}
                                    height={220}
                                    ariaLabel="Retiros de caja por período"
                                    currency={currency}
                                />
                            ) : (
                                <div className="rpt-empty rpt-expenses-empty-chart">
                                    {loadingExpenses
                                        ? 'Cargando…'
                                        : 'Sin retiros de caja en este período.'}
                                </div>
                            )}
                        </div>
                        <div className="rpt-expense-panel rpt-expense-panel--totals">
                            <table className="rpt-expense-table">
                                <thead>
                                    <tr>
                                        <th>Período</th>
                                        <th className="rpt-expense-table__num">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawalChartData.expenseBucketsOrdered.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="rpt-expense-table__empty">
                                                Sin datos agregados.
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                            {withdrawalChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={
                                                        expenseAgg === 'month' &&
                                                        row.key === currentMonthBucketKey
                                                            ? 'rpt-expense-table__current-month'
                                                            : undefined
                                                    }
                                                >
                                                    <td>{row.label}</td>
                                                    <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                        {fmt(row.total)}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="rpt-expense-table__total-row">
                                                <td>Total</td>
                                                <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                    {fmt(withdrawalChartData.periodTotal)}
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
                ) : null}

                {showRefundExpenseBlock ? (
                <section className="rpt-expenses-block rpt-expenses-block--refunds">
                    <div className="rpt-expenses-block-head">
                        <h4 className="rpt-expenses-section-title">Devoluciones</h4>
                        <span className="rpt-expenses-block-meta">
                            {refundBreakdown.count} mov. · {fmt(refundBreakdown.total)}
                        </span>
                    </div>
                    <div className="rpt-expenses-split">
                        <div className="rpt-chart-wrapper rpt-chart-wrapper--rosen rpt-expenses-chart-wrap">
                            {refundChartData.expenseBarPoints.length ? (
                                <RPTRosenBarChart
                                    points={refundChartData.expenseBarPoints}
                                    height={220}
                                    ariaLabel="Devoluciones por período"
                                    currency={currency}
                                />
                            ) : (
                                <div className="rpt-empty rpt-expenses-empty-chart">
                                    {loadingExpenses
                                        ? 'Cargando…'
                                        : 'Sin devoluciones en este período.'}
                                </div>
                            )}
                        </div>
                        <div className="rpt-expense-panel rpt-expense-panel--totals">
                            <table className="rpt-expense-table">
                                <thead>
                                    <tr>
                                        <th>Período</th>
                                        <th className="rpt-expense-table__num">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refundChartData.expenseBucketsOrdered.length === 0 ? (
                                        <tr>
                                            <td colSpan={2} className="rpt-expense-table__empty">
                                                Sin datos agregados.
                                            </td>
                                        </tr>
                                    ) : (
                                        <>
                                            {refundChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={
                                                        expenseAgg === 'month' &&
                                                        row.key === currentMonthBucketKey
                                                            ? 'rpt-expense-table__current-month'
                                                            : undefined
                                                    }
                                                >
                                                    <td>{row.label}</td>
                                                    <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                        {fmt(row.total)}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="rpt-expense-table__total-row">
                                                <td>Total</td>
                                                <td className="rpt-expense-table__num rpt-expense-table__amount">
                                                    {fmt(refundChartData.periodTotal)}
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
                ) : null}
            </div>
            <div className="rpt-expenses-recent-head">
                <h4 className="rpt-expenses-section-title">Movimientos recientes</h4>
                <span className="rpt-expenses-recent-meta">Últimos 80</span>
            </div>
            <div className="rpt-expense-panel rpt-expense-panel--movements">
                <table className="rpt-expense-table rpt-expense-table--movements">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Sucursal</th>
                            <th>Método</th>
                            <th>Detalle</th>
                            <th className="rpt-expense-table__num">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!filteredManualExpenseRows || filteredManualExpenseRows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="rpt-expense-table__empty">
                                    {loadingExpenses
                                        ? 'Cargando…'
                                        : manualExpenseRows.length || refundExpenseRows.length
                                          ? 'Sin movimientos para este filtro.'
                                          : 'Sin movimientos.'}
                                </td>
                            </tr>
                        ) : (
                            [...filteredManualExpenseRows]
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                .slice(0, 80)
                                .map((row) => {
                                    const sh = row[TABLES.cash_shifts] || row.cash_shifts;
                                    const bid = sh?.branch_id;
                                    const branchName = bid != null ? (branchNameById[String(bid)] || String(bid)) : '—';
                                    const d = new Date(row.created_at);
                                    const pm = row.payment_method;
                                    const metodo =
                                        pm === 'cash'
                                            ? 'Efectivo'
                                            : pm === 'card'
                                              ? 'Tarjeta'
                                              : pm === 'online'
                                                ? 'Transf.'
                                                : String(pm || '—');
                                    const kindLabel = labelForManualExpenseKind(row);
                                    const isRefund = isOrderLinkedExpense(row);
                                    return (
                                        <tr key={row.id}>
                                            <td className="rpt-expense-table__nowrap">
                                                {d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td>
                                                <span
                                                    className={`rpt-expense-kind-badge${isCashWithdrawal(row) ? ' rpt-expense-kind-badge--withdrawal' : ''}${isRefund ? ' rpt-expense-kind-badge--refund' : ''}`}
                                                >
                                                    {kindLabel}
                                                </span>
                                            </td>
                                            <td>{branchName}</td>
                                            <td>{metodo}</td>
                                            <td className="rpt-expense-table__ellipsis">{row.description || '—'}</td>
                                            <td className="rpt-expense-table__num rpt-expense-table__amount">{fmt(row.amount)}</td>
                                        </tr>
                                    );
                                })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const monthlyExportBlock = (
        <div
            style={{
                marginTop: '2rem',
                padding: '1.5rem',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
        >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text, #0f172a)' }}>
                Descargar Reporte Mensual
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--admin-text-muted, #6b7280)' }}>
                {MONTHLY_EXPORT_DISCLAIMER}
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted, #6b7280)', fontWeight: 500 }}>Seleccionar mes</label>
                    <input
                        type="month"
                        value={analyticsDate}
                        onChange={(e) => setAnalyticsDate(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 6,
                            color: 'var(--admin-text, #0f172a)',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem',
                            minWidth: 180,
                        }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleExportMonthlyExcel}
                    disabled={exportLoading}
                    style={{
                        padding: '10px 16px',
                        background: 'var(--accent-primary, #3b82f6)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: exportLoading ? 'not-allowed' : 'pointer',
                        opacity: exportLoading ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'opacity 0.2s',
                    }}
                >
                    {exportLoading ? (
                        <>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            Generando...
                        </>
                    ) : (
                        <>
                            <Download size={16} />
                            Descargar Excel
                        </>
                    )}
                </button>
                <div className="rpt-monthly-expenses-export-group" role="group" aria-label="Exportar gastos del mes">
                    {[
                        { action: 'modal', label: 'Ver (modal)', Icon: Eye },
                        { action: 'tab', label: 'Ver (pestaña)', Icon: ExternalLink },
                        { action: 'download', label: 'Descargar', Icon: Download },
                    ].map(({ action, label, Icon }) => (
                        <button
                            key={action}
                            type="button"
                            onClick={() => runMonthlyManualExpensesExport(action)}
                            disabled={exportExpensesLoading || !companyId}
                            className="rpt-monthly-expenses-export-btn"
                        >
                            {exportExpensesLoading ? (
                                <Loader2 size={16} className="rpt-expenses-spin" aria-hidden />
                            ) : (
                                <Icon size={16} aria-hidden />
                            )}
                            <span>{exportExpensesLoading ? 'Generando...' : label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    if (view === 'expensesOnly') {
        return (
            <div className="rpt-container rpt-container--compact-toolbar animate-fade">
                {gastosLocalSection}
                {monthlyExportBlock}
                <LocalExpenseModal
                    isOpen={isAddExpenseModalOpen}
                    onClose={() => setIsAddExpenseModalOpen(false)}
                    branchId={selectedBranch?.id}
                    branchName={selectedBranch?.name || selectedBranch?.label}
                    activeShift={cashSystem?.activeShift}
                    onConfirmOperating={handleConfirmRegisterLocalExpense}
                    registerRefund={cashSystem.registerRefund}
                    moveOrder={moveOrder}
                    showNotify={showNotify}
                    companyId={companyId}
                    onAfterSuccess={handleAfterExpenseMovement}
                />
                <SpreadsheetPreviewModal
                    isOpen={!!expensePreviewState}
                    onClose={() => setExpensePreviewState(null)}
                    title={expensePreviewState?.title ?? 'Vista previa'}
                    rows={expensePreviewState?.rows ?? []}
                    filename={expensePreviewState?.filename ?? 'reporte.xls'}
                />
            </div>
        );
    }

    return (
        <div className="rpt-container rpt-container--compact-toolbar animate-fade">
            {reportPeriodHeader}
            {multiCurrencyWarning ? (
                <p className="rpt-kpi-meta rpt-multi-currency-warning" style={{ margin: '0 0 1rem 0' }}>
                    {multiCurrencyWarning}
                </p>
            ) : null}
            {analyticsSource === 'fallback' && (
                <p className="rpt-kpi-meta" style={{ margin: '0 0 1rem 0' }}>
                    Mostrando hasta 2000 pedidos; las métricas pueden estar truncadas.
                </p>
            )}

            {/* KPI ROW */}
            <div className="rpt-kpi-row">
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon sales"><DollarSign size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Ventas totales</span>
                        <span className="rpt-kpi-value">{fmt(kpis.total)}</span>
                        {loadingAnalyticsOrders && <span className="rpt-kpi-meta">Cargando pedidos…</span>}
                    </div>
                    <TrendBadge value={trends.total} />
                </div>
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon orders"><ShoppingBag size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Pedidos</span>
                        <span className="rpt-kpi-value">{kpis.count}</span>
                    </div>
                    <TrendBadge value={trends.count} />
                </div>
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon ticket"><TrendingUp size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Ticket promedio</span>
                        <span className="rpt-kpi-value">{fmt(Math.round(kpis.ticket))}</span>
                    </div>
                </div>
                <div
                    className="rpt-kpi"
                    title="Suma solo de delivery_fee (tarifa de envío) en el período. No incluye el monto de productos del pedido."
                >
                    <div className="rpt-kpi-icon delivery"><Truck size={20} aria-hidden /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Total delivery</span>
                        <span className="rpt-kpi-value">{fmt(Math.round(kpis.deliveryTotal ?? 0))}</span>
                        <span className="rpt-kpi-meta">
                            {(kpis.deliveryCount ?? 0).toLocaleString('es-CL')}{' '}
                            pedido{(kpis.deliveryCount ?? 0) === 1 ? '' : 's'} con envío · solo tarifas
                        </span>
                    </div>
                    <TrendBadge value={trends.delivery} />
                </div>
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon clients"><Users size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Nuevos clientes</span>
                        <span className="rpt-kpi-value">{newClientsInfo.count}</span>
                    </div>
                    <TrendBadge value={newClientsInfo.trend} />
                </div>
                {/* KPI EGRESOS */}
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon expenses"><Wallet size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Gastos del local</span>
                        <span className="rpt-kpi-value">{fmt(expensesData.total)}</span>
                        {loadingExpenses && <span className="rpt-kpi-meta">Cargando...</span>}
                    </div>
                    <TrendBadge value={trends.expenses} />
                </div>
                {/* KPI BALANCE NETO */}
                <div className="rpt-kpi">
                    <div className="rpt-kpi-icon balance"><Banknote size={20} /></div>
                    <div className="rpt-kpi-body">
                        <span className="rpt-kpi-label">Balance neto</span>
                        <span className="rpt-kpi-value">{fmt(kpis.net)}</span>
                    </div>
                    <TrendBadge value={trends.net} />
                </div>
            </div>

            {/* Bloque principal Reportes: ventas (gráfico + lateral). Gastos del local: menú Ventas → Gastos del local */}
            <div className="rpt-main-grid">
                <div className="rpt-chart-card">
                    <div className="rpt-chart-header">
                        <h3>Ventas por día</h3>
                        <div className="rpt-chart-toolbar">
                            <div className="rpt-chart-kind" role="group" aria-label="Tipo de gráfico">
                                {CHART_KIND_OPTIONS.map(({ value, label, Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`rpt-chart-kind-btn ${activeChartKind === value ? 'active' : ''}`}
                                        onClick={() => setChartKind(value)}
                                        title={label}
                                        aria-pressed={activeChartKind === value}
                                        aria-label={label}
                                    >
                                        <Icon size={16} strokeWidth={1.75} aria-hidden />
                                        <span className="rpt-chart-kind-label">{label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="rpt-chart-tabs">
                                {[['all', 'Todos'], ['store', 'Tienda'], ['online', 'Online']].map(([key, label]) => (
                                    <button key={key} className={`rpt-tab ${chartTab === key ? 'active' : ''}`} onClick={() => setChartTab(key)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="rpt-chart-wrapper rpt-chart-wrapper--lwc">
                        {salesChartPoints.length ? (
                            <RPTSalesLightweightChart
                                points={salesChartPoints}
                                variant={activeChartKind}
                                height={reportRange.dayCount > 90 ? 260 : 280}
                                showExpenses
                            />
                        ) : (
                            <div className="rpt-empty" style={{ padding: '3rem', textAlign: 'center' }}>
                                Sin datos de ventas
                            </div>
                        )}
                    </div>
                </div>

                {/* SIDEBAR */}
                <div className="rpt-sidebar">
                    {/* Payment Breakdown */}
                    <div className="rpt-side-card">
                        <h4><AdminIconSlot Icon={CreditCard} slotSize="xs" tone="accent" /> Métodos de pago</h4>
                        <div style={{ marginBottom: '1.25rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                            <RPTRosenDonutChart
                                data={[
                                    { label: 'Efectivo', value: paymentBreakdown.cash, color: '#22c55e' },
                                    { label: 'Tarjeta', value: paymentBreakdown.card, color: '#3b82f6' },
                                    { label: 'Transferencia', value: paymentBreakdown.online, color: '#a855f7' },
                                ]}
                                height={150}
                                currency={currency}
                            />
                        </div>
                        <div className="rpt-payment-list">
                            {[
                                { label: 'Efectivo', value: paymentBreakdown.cash, Icon: DollarSign, color: '#22c55e' },
                                { label: 'Tarjeta', value: paymentBreakdown.card, Icon: CreditCard, color: '#3b82f6' },
                                { label: 'Transferencia', value: paymentBreakdown.online, Icon: Smartphone, color: '#a855f7' },
                            ].map(pm => {
                                const pct = kpis.total > 0 ? Math.round((pm.value / kpis.total) * 100) : 0;
                                return (
                                    <div key={pm.label} className="rpt-payment-row">
                                        <div className="rpt-payment-info">
                                            <AdminIconSlot
                                                Icon={pm.Icon}
                                                slotSize="xxs"
                                                size={12}
                                                style={{
                                                    color: pm.color,
                                                    background: `color-mix(in srgb, ${pm.color} 14%, var(--admin-card-bg, #fff))`,
                                                    borderColor: `color-mix(in srgb, ${pm.color} 32%, var(--admin-border, #e8ecf1))`,
                                                }}
                                            />
                                            <span>{pm.label}</span>
                                        </div>
                                        <div className="rpt-payment-bar-wrap">
                                            <div className="rpt-payment-bar" style={{ width: `${pct}%`, background: pm.color }} />
                                        </div>
                                        <div className="rpt-payment-values">
                                            <strong>{fmt(pm.value)}</strong>
                                            <span>{pct}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Peak Hour */}
                    {peakHour && (
                        <div className="rpt-side-card rpt-peak">
                            <h4><AdminIconSlot Icon={Clock} slotSize="xs" tone="accent" /> Hora pico</h4>
                            <div className="rpt-peak-value">{peakHour.hour}</div>
                            <div className="rpt-peak-sub">{peakHour.count} pedidos en este horario</div>
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div className="rpt-side-card">
                        <h4><AdminIconSlot Icon={Users} slotSize="xs" tone="accent" /> Clientes</h4>
                        <div className="rpt-quick-stats">
                            <div className="rpt-quick-stat">
                                <span className="rpt-quick-label">Total registrados</span>
                                <span className="rpt-quick-value">{newClientsInfo.total}</span>
                            </div>
                            <div className="rpt-quick-stat">
                                <span className="rpt-quick-label">Nuevos ({reportRange.hasComparison ? reportRange.displayLabel : 'total'})</span>
                                <span className="rpt-quick-value">{newClientsInfo.count}</span>
                            </div>
                        </div>
                    </div>

                    {/* Branch Breakdown */}
                    {branchStats.length > 0 && (
                        <div className="rpt-side-card">
                            <h4><AdminIconSlot Icon={MapPin} slotSize="xs" tone="accent" /> Ventas por Sucursal</h4>
                            <div className="rpt-payment-list">
                                {branchStats.map(b => {
                                    const pct = kpis.total > 0 ? Math.round((b.total / kpis.total) * 100) : 0;
                                    return (
                                        <div key={b.id} className="rpt-payment-row">
                                            <div className="rpt-payment-info" style={{flex: 1}}>
                                                <span style={{fontSize: '0.85rem'}}>{b.name}</span>
                                            </div>
                                            <div className="rpt-payment-values" style={{textAlign: 'right'}}>
                                                <strong>{fmt(b.total)}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted, #5a6169)', marginLeft: 6 }}>{pct}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* TOP PRODUCTS */}
            <div className="rpt-products-card">
                <h3><AdminIconSlot Icon={Package} slotSize="sm" tone="accent" /> Top productos vendidos</h3>
                {loadingTopProducts ? (
                    <div className="rpt-empty">Cargando top productos…</div>
                ) : topProducts.length === 0 ? (
                    <div className="rpt-empty">No hay datos de productos en este período.</div>
                ) : (
                    <div className="rpt-products-list">
                        {topProducts.map((p, i) => {
                            const maxQty = topProducts[0]?.qty || 1;
                            const pct = Math.round((p.qty / maxQty) * 100);
                            return (
                                <div key={p.name} className="rpt-product-row">
                                    <span className="rpt-product-rank">#{i + 1}</span>
                                    <div className="rpt-product-info">
                                        <span className="rpt-product-name">{p.name}</span>
                                        <div className="rpt-product-bar-wrap">
                                            <div className="rpt-product-bar" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <div className="rpt-product-stats">
                                        <span className="rpt-product-qty">{p.qty} uds</span>
                                        <span className="rpt-product-rev">{fmt(p.revenue)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {monthlyExportBlock}
            <LocalExpenseModal
                isOpen={isAddExpenseModalOpen}
                onClose={() => setIsAddExpenseModalOpen(false)}
                branchId={selectedBranch?.id}
                branchName={selectedBranch?.name || selectedBranch?.label}
                activeShift={cashSystem?.activeShift}
                onConfirmOperating={handleConfirmRegisterLocalExpense}
                registerRefund={cashSystem.registerRefund}
                moveOrder={moveOrder}
                showNotify={showNotify}
                companyId={companyId}
                onAfterSuccess={handleAfterExpenseMovement}
            />
            <SpreadsheetPreviewModal
                isOpen={!!expensePreviewState}
                onClose={() => setExpensePreviewState(null)}
                title={expensePreviewState?.title ?? 'Vista previa'}
                rows={expensePreviewState?.rows ?? []}
                filename={expensePreviewState?.filename ?? 'reporte.xls'}
            />
        </div>
    );
};

export default AdminAnalytics;
