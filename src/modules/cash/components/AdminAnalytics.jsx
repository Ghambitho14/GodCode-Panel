import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowUpRight, ArrowDownRight, Calendar,
    ShoppingBag, Users, DollarSign, CreditCard,
    Smartphone, TrendingUp, Package, Clock, MapPin, Truck,
    BarChart3, AreaChart, Wallet, Banknote, Download, Loader2, Plus, Eye, ExternalLink, LineChart
} from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
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
import { isMenuOrder, getOrderPaymentBreakdown, getPaymentLabel, ORDERS_EXPORT_SELECT } from '@/shared/utils/orderUtils';
import { fetchTopProducts } from '../services/analyticsService';
import { useAnalyticsData } from '../admin/tabs/analytics/useAnalyticsData';
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
import ReportSalesChart from './charts/ReportSalesChart';
import ReportPaymentDonut from './charts/ReportPaymentDonut';
import ReportSparkline from './charts/ReportSparkline';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const CHART_KIND_OPTIONS = [
    { value: 'area', label: 'Área', Icon: AreaChart },
    { value: 'bar-solid', label: 'Barras', Icon: BarChart3 },
    { value: 'bar-gradient', label: 'Barras degradado', Icon: BarChart3 },
];

const PAYMENT_META = [
    { key: 'cash', label: 'Efectivo', Icon: DollarSign, color: '#16a34a', bg: 'bg-[#16a34a]/10' },
    { key: 'card', label: 'Tarjeta', Icon: CreditCard, color: '#2563eb', bg: 'bg-[#2563eb]/10' },
    { key: 'online', label: 'Transferencia', Icon: Smartphone, color: '#7c3aed', bg: 'bg-[#7c3aed]/10' },
];

const KPI_META = [
    { key: 'total', label: 'Ventas', Icon: DollarSign, color: '#e8483e' },
    { key: 'count', label: 'Pedidos', Icon: ShoppingBag, color: '#2563eb' },
    { key: 'ticket', label: 'Ticket prom.', Icon: TrendingUp, color: '#7c3aed' },
    { key: 'deliveryTotal', label: 'Delivery', Icon: Truck, color: '#ea7b4b' },
    { key: 'clients', label: 'Nuevos clientes', Icon: Users, color: '#16a34a' },
    { key: 'expenses', label: 'Gastos', Icon: Wallet, color: '#dc2626' },
];

const FLAT_SPARKLINE = [0, 0, 0];

function calcTrendPercent(current, prev) {
    const c = Number(current);
    const p = Number(prev);
    if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
    if (p === 0) return c > 0 ? 100 : 0;
    const pct = Math.round(((c - p) / p) * 100);
    return Number.isFinite(pct) ? pct : null;
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
    if (value == null || !Number.isFinite(value)) {
        return <Badge variant="outline" className="text-[10px] font-bold text-[#6b7280]">—</Badge>;
    }
    if (value === 0) return <Badge variant="outline" className="gap-0.5 text-[10px] font-bold">0%</Badge>;
    const pos = value > 0;
    return (
        <Badge variant={pos ? 'success' : 'danger'} className="gap-0.5 text-[10px] font-bold">
            {pos ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
            {Math.abs(value)}%
        </Badge>
    );
};

function formatKpiValue(metaKey, value, fmt) {
    if (metaKey === 'count') {
        return Math.round(Number(value) || 0).toLocaleString('es-CL');
    }
    return fmt(value);
}

function resolveKpiTrendKey(metaKey) {
    if (metaKey === 'deliveryTotal') return 'delivery';
    return metaKey;
}

function resolveKpiSparkKey(metaKey) {
    if (metaKey === 'deliveryTotal') return 'delivery';
    if (metaKey === 'clients') return 'clients';
    return metaKey;
}

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
            endIso: reportRange.end ? reportRange.end.toISOString() : new Date().toISOString(),
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

const KpiCard = memo(({ meta, value, trend, sparklineValues, loading, fmt, subtitle, showTrend }) => {
    const Icon = meta.Icon;
    return (
        <Card className="flex flex-col p-6 transition-all duration-150 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.12)]">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color}1A`, color: meta.color }}
                >
                    <Icon size={20} />
                </div>
                {showTrend ? <TrendBadge value={trend} /> : null}
            </div>
            <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#9ca3af]">{meta.label}</p>
                {loading ? <Skeleton className="h-8 w-28" /> : (
                    <p className="text-[26px] font-bold leading-tight tracking-tight text-[#14161a]">{formatKpiValue(meta.key, value, fmt)}</p>
                )}
            </div>
            {subtitle && <p className="mt-1 text-xs font-medium text-[#6b7280]">{subtitle}</p>}
            <div className="mt-4 h-8">
                <ReportSparkline
                    values={sparklineValues}
                    trend={trend}
                    showTrend={showTrend}
                    height={32}
                />
            </div>
        </Card>
    );
});

const AdminAnalytics = ({ orders, clients, branches, showNotify, companyId, selectedBranch, view = 'full' }) => {
    const { cashSystem, moveOrder, companyProfile } = useAdmin();

    const safeBranches = useMemo(
        () => (branches || []).filter((b) => b && typeof b === 'object'),
        [branches],
    );

    const { formatMoney: fmt, currency } = useMemo(
        () => createMoneyFormatter(selectedBranch, companyProfile),
        [selectedBranch, companyProfile],
    );

    const multiCurrencyWarning = useMemo(() => {
        if (selectedBranch?.id !== 'all') return null;
        const realBranches = safeBranches.filter((b) => b.id && b.id !== 'all');
        if (realBranches.length < 2) return null;
        const currencies = new Set(realBranches.map((b) => resolveEffectiveCurrency(b, companyProfile)));
        if (currencies.size <= 1) return null;
        return `Las sucursales usan monedas distintas (${[...currencies].join(', ')}). Los totales no convierten entre monedas.`;
    }, [selectedBranch?.id, safeBranches, companyProfile]);

    const exportIdLabel = useMemo(() => {
        const country = selectedBranch?.id === 'all'
            ? companyProfile?.country
            : resolveEffectiveCountry(selectedBranch, companyProfile);
        return getFormStrategy(country).idName;
    }, [selectedBranch, companyProfile]);

    const [filterPeriod, setFilterPeriod] = useState(() => (view === 'expensesOnly' ? 'month' : '7'));
    const [chartTab, setChartTab] = useState('all');
    const [chartKind, setChartKind] = useState('area');
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
    const [topProductsFromRpc, setTopProductsFromRpc] = useState([]);
    const [loadingTopProducts, setLoadingTopProducts] = useState(false);
    const [expenseRefreshNonce, setExpenseRefreshNonce] = useState(0);
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
    const [expensePreviewState, setExpensePreviewState] = useState(null);
    const [expenseKindFilter, setExpenseKindFilter] = useState('all');

    const [reportAnchorDate] = useState(() => new Date());
    const reportRange = useMemo(
        () => resolveReportPeriodRange(filterPeriod, reportAnchorDate),
        [filterPeriod, reportAnchorDate],
    );
    const adminAnalyticsRenderCountRef = useRef(0);
    adminAnalyticsRenderCountRef.current += 1;
    console.log(
        '[AdminAnalytics] render #%s, view=%s, filterPeriod=%s, reportRange.start=%s, rangeObj=%s',
        adminAnalyticsRenderCountRef.current,
        view,
        filterPeriod,
        reportRange.start?.getTime(),
        reportRange,
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

    const {
        analyticsSummary,
        analyticsSource,
        analyticsOrders,
        loadingAnalyticsOrders,
    } = useAnalyticsData({
        companyId,
        selectedBranch,
        reportRange,
        chartTab,
        view,
        showNotify,
    });

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
        return () => { cancelled = true; };
    }, [
        companyId,
        selectedBranch?.id,
        reportRange.start?.getTime(),
        reportRange.end?.getTime(),
        reportRange.chartDateKeys?.join(','),
        showNotify,
    ]);

    const ordersForAnalytics = useMemo(() => {
        if (!companyId) return Array.isArray(orders) ? orders : [];
        if (analyticsSource !== 'fallback') return [];
        if (loadingAnalyticsOrders && analyticsOrders.length === 0 && Array.isArray(orders) && orders.length > 0) {
            return orders;
        }
        return analyticsOrders;
    }, [companyId, analyticsSource, loadingAnalyticsOrders, analyticsOrders, orders]);

    const branchNameById = useMemo(() => {
        const map = {};
        safeBranches.forEach((b) => {
            if (b?.id != null) map[String(b.id)] = b.name || b.label || String(b.id);
        });
        return map;
    }, [safeBranches]);

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

    const operatingChartPoints = useMemo(
        () => operatingChartData.expenseBarPoints.map((p) => ({ ...p, sales: p.value, expenses: 0 })),
        [operatingChartData.expenseBarPoints],
    );

    const withdrawalChartPoints = useMemo(
        () => withdrawalChartData.expenseBarPoints.map((p) => ({ ...p, sales: p.value, expenses: 0 })),
        [withdrawalChartData.expenseBarPoints],
    );

    const refundChartPoints = useMemo(
        () => refundChartData.expenseBarPoints.map((p) => ({ ...p, sales: p.value, expenses: 0 })),
        [refundChartData.expenseBarPoints],
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
        if (expenseKindFilter === 'order_refund') return refundExpenseRows || [];
        const rows = manualExpenseRows || [];
        if (expenseKindFilter === 'cash_withdrawal') return rows.filter((r) => isCashWithdrawal(r));
        if (expenseKindFilter === 'operating') return rows.filter((r) => isOperatingLocalExpense(r));
        return [...rows, ...(refundExpenseRows || [])];
    }, [manualExpenseRows, refundExpenseRows, expenseKindFilter]);

    const showOperatingExpenseBlock = expenseKindFilter === 'all' || expenseKindFilter === 'operating';
    const showWithdrawalExpenseBlock = expenseKindFilter === 'all' || expenseKindFilter === 'cash_withdrawal';
    const showRefundExpenseBlock = expenseKindFilter === 'all' || expenseKindFilter === 'order_refund';

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
        return () => { cancelled = true; };
	}, [
		reportRange.start?.getTime(),
		reportRange.end?.getTime(),
		reportRange.prevStart?.getTime(),
		reportRange.prevEnd?.getTime(),
		reportRange.hasComparison,
		reportRange.chartDateKeys?.join(','),
		reportRange.fetchStartIso,
		reportRange.fetchEndIso,
		companyId,
		selectedBranch?.id,
		analyticsDate,
		expenseRefreshNonce,
		expenseAgg,
	]);

    const reportChartData = useMemo(() => {
        const emptyResult = {
            salesChartPoints: [],
            kpis: { total: 0, count: 0, ticket: 0, deliveryTotal: 0, deliveryCount: 0, net: -(expensesData.total || 0) },
            trends: { total: 0, count: 0, ticket: 0, delivery: 0, expenses: 0, net: 0 },
            paymentBreakdown: { cash: 0, card: 0, online: 0 },
            branchStats: [],
        };

        const buildExpensesByDate = (chartDateKeys) => {
            const expensesByDate = {};
            chartDateKeys.forEach((k) => { expensesByDate[k] = 0; });
            for (const row of manualExpenseRows || []) {
                if (!row) continue;
                const iso = row.created_at;
                if (!iso) continue;
                const localDate = new Date(iso).toLocaleDateString('en-CA');
                if (expensesByDate[localDate] !== undefined) {
                    expensesByDate[localDate] += Number(row.amount) || 0;
                }
            }
            return expensesByDate;
        };

        if (analyticsSource === 'rpc' && analyticsSummary?.current && analyticsSummary?.prev) {
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
            const prevTicket = prevCount > 0 ? prevSales / prevCount : 0;
            const totalNet = totalSales - (expensesData.total || 0);
            const prevNet = prevSales - (expensesData.prevTotal || 0);
            const realBranches = safeBranches.filter((b) => b.id && b.id !== 'all');
            const branchNameLookup = {};
            realBranches.forEach((b) => { branchNameLookup[b.id] = b.name || 'Sucursal sin nombre'; });
            const sortedBranches = (Array.isArray(cur.byBranch) ? cur.byBranch : [])
                .map((b) => ({
                    id: b.branchId,
                    name: branchNameLookup[b.branchId] || (b.branchId === '_sin_asignar_' ? 'Sin asignar' : 'Sucursal eliminada'),
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
                    ticket: calcTrendPercent(ticket, prevTicket),
                    delivery: calcTrendPercent(cur.deliveryTotal, prev.deliveryTotal),
                    expenses: !expensesData.prevTotal
                        ? expensesData.total > 0 ? 100 : 0
                        : Math.round(((expensesData.total - expensesData.prevTotal) / expensesData.prevTotal) * 100),
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
        const prevRange = { start: range.prevStart, end: range.prevEnd };

        const filterByTab = (o) => {
            if (chartTab === 'all') return true;
            if (chartTab === 'online') return isMenuOrder(o);
            if (chartTab === 'store') return !isMenuOrder(o);
            return true;
        };

        const valid = ordersForAnalytics.filter((o) => o && o.status !== 'cancelled');
        const validBranchIds = new Set(safeBranches.map((b) => b.id));
        
        const current = valid.filter(o => {
            if (!o) return false;
            const d = new Date(o.created_at);
            return isInReportRange(d, range) && filterByTab(o);
        });

        const prev = valid.filter(o => {
            if (!o) return false;
            const d = new Date(o.created_at);
            return range.hasComparison && isInReportRange(d, prevRange) && filterByTab(o) && o.branch_id && validBranchIds.has(o.branch_id);
        });

        const salesByDate = {};
        const chartDateKeys = [...range.chartDateKeys];
        chartDateKeys.forEach((key) => { salesByDate[key] = 0; });

        current.forEach(o => {
            if (!o) return;
            const localDate = new Date(o.created_at).toLocaleDateString('en-CA');
            if (salesByDate[localDate] !== undefined) {
                salesByDate[localDate] += Number(o.total);
            }
        });

        const expensesByDate = buildExpensesByDate(chartDateKeys);

        const totalSales = current.reduce((a, o) => a + Number(o.total), 0);
        const count = current.length;
        const ticket = count > 0 ? totalSales / count : 0;

        const prevSales = prev.reduce((a, o) => a + Number(o.total), 0);
        const prevCount = prev.length;
        const prevTicket = prevCount > 0 ? prevSales / prevCount : 0;

        const totalNet = totalSales - (expensesData.total || 0);
        const prevNet = prevSales - (expensesData.prevTotal || 0);

        const deliveryOrdersCurrent = current.filter((o) => {
            const fee = Number(o?.delivery_fee);
            return Number.isFinite(fee) && fee > 0;
        });
        const deliveryCount = deliveryOrdersCurrent.length;
        const totalDeliveryFees = deliveryOrdersCurrent.reduce((a, o) => a + Number(o.delivery_fee), 0);
        const prevTotalDeliveryFees = prev
            .filter((o) => {
                const fee = Number(o?.delivery_fee);
                return Number.isFinite(fee) && fee > 0;
            })
            .reduce((a, o) => a + Number(o.delivery_fee), 0);
        const trendDelivery = prevTotalDeliveryFees === 0
            ? totalDeliveryFees > 0 ? 100 : 0
            : Math.round(((totalDeliveryFees - prevTotalDeliveryFees) / prevTotalDeliveryFees) * 100);

        const pb = { cash: 0, card: 0, online: 0 };
        current.forEach((o) => {
            if (!o) return;
            const breakdown = getOrderPaymentBreakdown(o);
            pb.cash += breakdown.cash;
            pb.card += breakdown.card;
            pb.online += breakdown.online;
        });

        const bStats = {};
        const realBranches = safeBranches.filter((b) => b.id && b.id !== 'all');
        realBranches.forEach(b => { bStats[b.id] = { id: b.id, name: b.name || 'Sucursal sin nombre', total: 0, count: 0 }; });
        
        current.forEach(o => {
            if (!o) return;
            const bid = o.branch_id || '_sin_asignar_';
            if (!bStats[bid]) {
                const branchName = realBranches.find(b => b.id === bid)?.name || (bid === '_sin_asignar_' ? 'Sin asignar' : 'Sucursal eliminada');
                bStats[bid] = { id: bid, name: branchName, total: 0, count: 0 };
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
                ticket: prevTicket === 0 ? (ticket > 0 ? 100 : 0) : Math.round(((ticket - prevTicket) / prevTicket) * 100),
                delivery: trendDelivery,
                expenses: !expensesData.prevTotal ? (expensesData.total > 0 ? 100 : 0) : Math.round(((expensesData.total - expensesData.prevTotal) / expensesData.prevTotal) * 100),
                net: !prevNet ? (totalNet !== 0 ? 100 : 0) : Math.round(((totalNet - prevNet) / prevNet) * 100)
            },
            paymentBreakdown: pb,
            branchStats: sortedBranches
        };
    }, [analyticsSource, analyticsSummary, ordersForAnalytics, reportRange, chartTab, safeBranches, expensesData, manualExpenseRows]);

    const { salesChartPoints, kpis, trends, paymentBreakdown, branchStats } = reportChartData;

    const paymentDonutData = useMemo(
        () => PAYMENT_META.map((m) => ({ label: m.label, value: paymentBreakdown[m.key] || 0 })),
        [paymentBreakdown.cash, paymentBreakdown.card, paymentBreakdown.online],
    );

    const newClientsInfo = useMemo(() => {
        if (!clients) return { count: 0, trend: 0, total: 0 };
        const range = reportRange;
        const prevRange = { start: range.prevStart, end: range.prevEnd };
        const currentNew = clients.filter((c) => c && isInReportRange(new Date(c.created_at || new Date()), range)).length;
        const prevNew = range.hasComparison
            ? clients.filter((c) => c && isInReportRange(new Date(c.created_at || new Date()), prevRange)).length
            : 0;

        return {
            count: currentNew,
            trend: !range.hasComparison
                ? null
                : prevNew === 0
                    ? (currentNew > 0 ? 100 : 0)
                    : Math.round(((currentNew - prevNew) / prevNew) * 100),
            total: clients.length,
        };
    }, [clients, reportRange]);

    const topProducts = topProductsFromRpc;

    const clientsDonutData = useMemo(
        () => [
            { name: 'Nuevos', value: newClientsInfo.count, color: '#e8483e' },
            { name: 'Registrados', value: Math.max(0, newClientsInfo.total - newClientsInfo.count), color: '#ededf0' },
        ],
        [newClientsInfo.count, newClientsInfo.total],
    );

    const kpiSparklines = useMemo(() => {
        const keys = reportRange.chartDateKeys || [];
        if (!keys.length) {
            return {
                total: FLAT_SPARKLINE,
                count: FLAT_SPARKLINE,
                ticket: FLAT_SPARKLINE,
                delivery: FLAT_SPARKLINE,
                clients: FLAT_SPARKLINE,
                expenses: FLAT_SPARKLINE,
                net: FLAT_SPARKLINE,
            };
        }

        const bucket = () => Object.fromEntries(keys.map((k) => [k, 0]));
        const ordersByDay = bucket();
        const deliveryByDay = bucket();
        const clientsByDay = bucket();

        const inRange = (d) => isInReportRange(d, reportRange);
        const tabMatch = (o) => {
            if (chartTab === 'all') return true;
            if (chartTab === 'online') return isMenuOrder(o);
            if (chartTab === 'store') return !isMenuOrder(o);
            return true;
        };

        for (const o of ordersForAnalytics || []) {
            if (!o) continue;
            if (o.status === 'cancelled') continue;
            const d = new Date(o.created_at);
            if (!inRange(d) || !tabMatch(o)) continue;
            const key = d.toLocaleDateString('en-CA');
            if (ordersByDay[key] === undefined) continue;
            ordersByDay[key] += 1;
            const fee = Number(o.delivery_fee);
            if (Number.isFinite(fee) && fee > 0) deliveryByDay[key] += fee;
        }

        for (const c of clients || []) {
            if (!c) continue;
            const d = new Date(c.created_at || Date.now());
            if (!inRange(d)) continue;
            const key = d.toLocaleDateString('en-CA');
            if (clientsByDay[key] !== undefined) clientsByDay[key] += 1;
        }

        const toSeries = (obj) => keys.map((k) => obj[k] || 0);
        const salesSeries = salesChartPoints.map((p) => Number(p.sales) || 0);
        const expensesSeries = salesChartPoints.map((p) => Number(p.expenses) || 0);
        const ordersSeries = toSeries(ordersByDay);

        return {
            total: salesSeries,
            count: ordersSeries,
            ticket: keys.map((_, i) => (ordersSeries[i] > 0 ? salesSeries[i] / ordersSeries[i] : 0)),
            delivery: toSeries(deliveryByDay),
            clients: toSeries(clientsByDay),
            expenses: expensesSeries,
            net: salesSeries.map((v, i) => v - expensesSeries[i]),
        };
    }, [reportRange, salesChartPoints, ordersForAnalytics, clients, chartTab]);

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
        ordersForAnalytics
            .filter((o) => o && o.status !== 'cancelled' && isInReportRange(new Date(o.created_at), reportRange))
            .forEach(o => {
                if (!o) return;
                const h = new Date(o.created_at).getHours();
                hourCounts[h] = (hourCounts[h] || 0) + 1;
            });

        const sorted = Object.entries(hourCounts).sort(([, a], [, b]) => b - a);
        if (sorted.length === 0) return null;
        const h = parseInt(sorted[0][0]);
        return { hour: `${h}:00 - ${h + 1}:00`, count: sorted[0][1] };
    }, [analyticsSource, analyticsSummary, ordersForAnalytics, reportRange]);

    const peakHourDistribution = useMemo(() => {
        const buckets = [
            { label: 'Madrugada', hours: [0, 1, 2, 3, 4, 5], count: 0 },
            { label: 'Mañana', hours: [6, 7, 8, 9, 10, 11], count: 0 },
            { label: 'Tarde', hours: [12, 13, 14, 15, 16, 17], count: 0 },
            { label: 'Noche', hours: [18, 19, 20, 21, 22, 23], count: 0 },
        ];
        const hourCounts = {};
        if (analyticsSource === 'rpc' && analyticsSummary) {
            const currentByHour = analyticsSummary.current.byHour || {};
            Object.entries(currentByHour).forEach(([h, count]) => {
                hourCounts[Number(h)] = Number(count) || 0;
            });
        } else if (ordersForAnalytics?.length) {
            ordersForAnalytics
                .filter((o) => o && o.status !== 'cancelled' && isInReportRange(new Date(o.created_at), reportRange))
                .forEach((o) => {
                    if (!o) return;
                    const h = new Date(o.created_at).getHours();
                    hourCounts[h] = (hourCounts[h] || 0) + 1;
                });
        }
        buckets.forEach((b) => {
            b.count = b.hours.reduce((sum, h) => sum + (hourCounts[h] || 0), 0);
        });
        const max = Math.max(...buckets.map((b) => b.count), 1);
        return buckets.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }));
    }, [analyticsSource, analyticsSummary, ordersForAnalytics, reportRange]);

    const activeChartKind =
        chartKind === 'bar-gradient'
            ? 'bar-gradient'
            : chartKind === 'bar-solid' || chartKind === 'bar'
              ? 'bar-solid'
              : 'area';

    const reportPeriodHeader = (
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-black tracking-tight text-[#1a1a1a]">Reportes</h1>
                <p className="text-sm font-medium text-[#6b7280]">
                    Resumen de ventas, pedidos y métricas clave
                </p>
            </div>
            <div className="flex items-center gap-3">
                <ReportPeriodSelect
                    value={filterPeriod}
                    onChange={setFilterPeriod}
                    aria-label="Rango de fechas del informe"
                    icon={<Calendar size={18} strokeWidth={1.65} className="text-[#e8483e]" />}
                />
            </div>
        </header>
    );

    const gastosLocalSection = (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-xl">
                    <CardTitle className="text-lg">Gastos del local</CardTitle>
                    <CardDescription>
                        Mercadería, arriendo, sueldo y gastos operativos. Los retiros de efectivo hechos en Caja también
                        aparecen aquí para control del CEO.
                    </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={tryOpenRegisterExpenseModal} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <Plus size={17} strokeWidth={2.25} aria-hidden />
                        Registrar movimiento
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleExportManualExpensesExcel}
                        disabled={exportExpensesLoading || !(manualExpenseRows.length || refundExpenseRows.length)}
                    >
                        {exportExpensesLoading ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                            <Download size={14} aria-hidden />
                        )}
                        <span>Excel (vista)</span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">Período</span>
                    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#f5f5f7] p-1">
                        {EXPENSE_PERIOD_TABS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                                    filterPeriod === value
                                        ? 'bg-white text-[#e8483e] shadow-sm'
                                        : 'text-[#6b7280] hover:text-[#1a1a1a]'
                                }`}
                                onClick={() => setFilterPeriod(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <ReportPeriodSelect
                        className="max-w-[160px]"
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
                        options={EXPENSE_PERIOD_MORE_OPTIONS}
                        onChange={handleExpenseMorePeriodChange}
                    />
                    {isCustomDayPeriod(filterPeriod) ? (
                        <input
                            type="date"
                            className="h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold"
                            value={expenseCustomDay}
                            onChange={handleExpenseCustomDayChange}
                            aria-label="Día específico"
                        />
                    ) : null}
                    {expenseAgg === 'month' ? (
                        <span className="text-xs font-bold text-[#1a1a1a]">Año {expenseReferenceYear}</span>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">Agrupar</span>
                    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#f5f5f7] p-1">
                        {EXPENSE_AGG_OPTIONS.map(({ value, label }) => (
                            <button
                                key={value}
                                type="button"
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                                    expenseAgg === value
                                        ? 'bg-white text-[#e8483e] shadow-sm'
                                        : 'text-[#6b7280] hover:text-[#1a1a1a]'
                                }`}
                                onClick={() => setExpenseAgg(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">Tipo</span>
                    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-[#f5f5f7] p-1">
                        {expenseKindFilterOptions.map(({ value, label, count }) => (
                            <button
                                key={value}
                                type="button"
                                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                                    expenseKindFilter === value
                                        ? 'bg-white text-[#e8483e] shadow-sm'
                                        : 'text-[#6b7280] hover:text-[#1a1a1a]'
                                }`}
                                onClick={() => setExpenseKindFilter(value)}
                            >
                                <span>{label}</span>
                                {count > 0 ? (
                                    <span className="rounded-full bg-[#f5f5f7] px-1.5 py-0.5 text-[10px] font-bold text-[#6b7280]">
                                        {count}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>

                {(manualExpenseRows.length > 0 || refundExpenseRows.length > 0) && expenseKindFilter === 'all' ? (
                    <p className="text-xs font-medium text-[#6b7280]">
                        Total período: <strong className="text-[#1a1a1a]">{fmt(expensesData.total)}</strong>
                        {' · '}
                        Operativos: <strong className="text-[#1a1a1a]">{fmt(manualExpenseBreakdown.operating)}</strong> (
                        {manualExpenseBreakdown.operatingCount})
                        {' · '}
                        Retiros caja: <strong className="text-[#1a1a1a]">{fmt(manualExpenseBreakdown.withdrawals)}</strong> (
                        {manualExpenseBreakdown.withdrawalCount})
                        {' · '}
                        Devoluciones: <strong className="text-[#1a1a1a]">{fmt(refundBreakdown.total)}</strong> ({refundBreakdown.count})
                    </p>
                ) : null}

                <div className="space-y-6">
                    {showOperatingExpenseBlock ? (
                        <section className="space-y-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <h4 className="text-sm font-bold text-[#1a1a1a]">Gastos operativos</h4>
                                <span className="text-xs font-semibold text-[#6b7280]">
                                    {manualExpenseBreakdown.operatingCount} mov. · {fmt(manualExpenseBreakdown.operating)}
                                </span>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="min-h-[220px] rounded-xl border border-[#e5e5ea] bg-white p-4">
                                    {operatingChartPoints.length ? (
                                        <ReportSalesChart
                                            points={operatingChartPoints}
                                            kind="bar-solid"
                                            currency={currency}
                                            height={200}
                                            showHeader
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-[#6b7280]">
                                            {loadingExpenses ? 'Cargando…' : 'Sin gastos operativos en este período.'}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-[280px] overflow-auto rounded-xl border border-[#e5e5ea]">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-[#f5f5f7]">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Período</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold uppercase text-[#6b7280]">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {operatingChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={expenseAgg === 'month' && row.key === currentMonthBucketKey ? 'bg-[#f5f5f7]' : ''}
                                                >
                                                    <td className="px-4 py-2 text-[#1a1a1a]">{row.label}</td>
                                                    <td className="px-4 py-2 text-right font-bold tabular-nums text-[#1a1a1a]">{fmt(row.total)}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-t border-[#e5e5ea] bg-[#f5f5f7] font-bold">
                                                <td className="px-4 py-2 text-[#1a1a1a]">Total</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[#1a1a1a]">{fmt(operatingChartData.periodTotal)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {showWithdrawalExpenseBlock ? (
                        <section className="space-y-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <h4 className="text-sm font-bold text-[#1a1a1a]">Retiros de caja</h4>
                                <span className="text-xs font-semibold text-[#6b7280]">
                                    {manualExpenseBreakdown.withdrawalCount} mov. · {fmt(manualExpenseBreakdown.withdrawals)}
                                </span>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="min-h-[220px] rounded-xl border border-[#e5e5ea] bg-white p-4">
                                    {withdrawalChartPoints.length ? (
                                        <ReportSalesChart
                                            points={withdrawalChartPoints}
                                            kind="bar-solid"
                                            currency={currency}
                                            height={200}
                                            showHeader
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-[#6b7280]">
                                            {loadingExpenses ? 'Cargando…' : 'Sin retiros de caja en este período.'}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-[280px] overflow-auto rounded-xl border border-[#e5e5ea]">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-[#f5f5f7]">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Período</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold uppercase text-[#6b7280]">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {withdrawalChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={expenseAgg === 'month' && row.key === currentMonthBucketKey ? 'bg-[#f5f5f7]' : ''}
                                                >
                                                    <td className="px-4 py-2 text-[#1a1a1a]">{row.label}</td>
                                                    <td className="px-4 py-2 text-right font-bold tabular-nums text-[#1a1a1a]">{fmt(row.total)}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-t border-[#e5e5ea] bg-[#f5f5f7] font-bold">
                                                <td className="px-4 py-2 text-[#1a1a1a]">Total</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[#1a1a1a]">{fmt(withdrawalChartData.periodTotal)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {showRefundExpenseBlock ? (
                        <section className="space-y-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <h4 className="text-sm font-bold text-[#1a1a1a]">Devoluciones</h4>
                                <span className="text-xs font-semibold text-[#6b7280]">
                                    {refundBreakdown.count} mov. · {fmt(refundBreakdown.total)}
                                </span>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="min-h-[220px] rounded-xl border border-[#e5e5ea] bg-white p-4">
                                    {refundChartPoints.length ? (
                                        <ReportSalesChart
                                            points={refundChartPoints}
                                            kind="bar-solid"
                                            currency={currency}
                                            height={200}
                                            showHeader
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-sm text-[#6b7280]">
                                            {loadingExpenses ? 'Cargando…' : 'Sin devoluciones en este período.'}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-[280px] overflow-auto rounded-xl border border-[#e5e5ea]">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-[#f5f5f7]">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Período</th>
                                                <th className="px-4 py-2 text-right text-xs font-bold uppercase text-[#6b7280]">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {refundChartData.expenseBucketsOrdered.map((row) => (
                                                <tr
                                                    key={row.key}
                                                    className={expenseAgg === 'month' && row.key === currentMonthBucketKey ? 'bg-[#f5f5f7]' : ''}
                                                >
                                                    <td className="px-4 py-2 text-[#1a1a1a]">{row.label}</td>
                                                    <td className="px-4 py-2 text-right font-bold tabular-nums text-[#1a1a1a]">{fmt(row.total)}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-t border-[#e5e5ea] bg-[#f5f5f7] font-bold">
                                                <td className="px-4 py-2 text-[#1a1a1a]">Total</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[#1a1a1a]">{fmt(refundChartData.periodTotal)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>

                <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                        <h4 className="text-sm font-bold text-[#1a1a1a]">Movimientos recientes</h4>
                        <span className="text-xs font-semibold text-[#6b7280]">Últimos 80</span>
                    </div>
                    <div className="max-h-[280px] overflow-auto rounded-xl border border-[#e5e5ea]">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-[#f5f5f7]">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Fecha</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Tipo</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Sucursal</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Método</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase text-[#6b7280]">Detalle</th>
                                    <th className="px-4 py-2 text-right text-xs font-bold uppercase text-[#6b7280]">Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!filteredManualExpenseRows || filteredManualExpenseRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#6b7280]">
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
                                                <tr key={row.id} className="border-t border-[#e5e5ea]">
                                                    <td className="px-4 py-2 whitespace-nowrap text-[#1a1a1a]">
                                                        {d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <Badge
                                                            variant={isCashWithdrawal(row) ? 'danger' : isRefund ? 'outline' : 'secondary'}
                                                            className="text-[10px]"
                                                        >
                                                            {kindLabel}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-2 text-[#1a1a1a]">{branchName}</td>
                                                    <td className="px-4 py-2 text-[#1a1a1a]">{metodo}</td>
                                                    <td className="max-w-[200px] truncate px-4 py-2 text-[#1a1a1a]">{row.description || '—'}</td>
                                                    <td className="px-4 py-2 text-right font-bold tabular-nums text-[#1a1a1a]">{fmt(row.amount)}</td>
                                                </tr>
                                            );
                                        })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const monthlyExportBlock = (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Descargar Reporte Mensual</CardTitle>
                <CardDescription>{MONTHLY_EXPORT_DISCLAIMER}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#6b7280]">Seleccionar mes</label>
                        <input
                            type="month"
                            className="h-10 rounded-xl border border-[#e5e5ea] bg-white px-3 text-sm font-semibold text-[#1a1a1a]"
                            value={analyticsDate}
                            onChange={(e) => setAnalyticsDate(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleExportMonthlyExcel} disabled={exportLoading} className="gap-2">
                        {exportLoading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" aria-hidden />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Download size={16} aria-hidden />
                                Descargar Excel
                            </>
                        )}
                    </Button>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { action: 'modal', label: 'Ver (modal)', Icon: Eye },
                            { action: 'tab', label: 'Ver (pestaña)', Icon: ExternalLink },
                            { action: 'download', label: 'Descargar', Icon: Download },
                        ].map(({ action, label, Icon }) => (
                            <Button
                                key={action}
                                variant="outline"
                                size="sm"
                                onClick={() => runMonthlyManualExpensesExport(action)}
                                disabled={exportExpensesLoading || !companyId}
                                className="gap-2"
                            >
                                {exportExpensesLoading ? (
                                    <Loader2 size={16} className="animate-spin" aria-hidden />
                                ) : (
                                    <Icon size={16} aria-hidden />
                                )}
                                <span>{exportExpensesLoading ? 'Generando...' : label}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (view === 'expensesOnly') {
        return (
            <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 bg-[#f5f5f7] p-6 animate-fade">
                {gastosLocalSection}
                {monthlyExportBlock}
                <LocalExpenseModal
                    isOpen={isAddExpenseModalOpen}
                    onClose={() => setIsAddExpenseModalOpen(false)}
                    branchId={selectedBranch?.id}
                    branchName={selectedBranch?.name || selectedBranch?.label}
                    activeShift={cashSystem?.activeShift}
                    onConfirmOperating={handleConfirmRegisterLocalExpense}
                    registerRefund={cashSystem?.registerRefund}
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
        <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 bg-[#f5f5f7] p-6 animate-fade">
            {reportPeriodHeader}

            {multiCurrencyWarning ? (
                <p className="rounded-xl border border-[#e5e5ea] bg-white p-3 text-xs font-semibold text-[#6b7280]">
                    {multiCurrencyWarning}
                </p>
            ) : null}
            {analyticsSource === 'fallback' && (
                <p className="rounded-xl border border-[#e5e5ea] bg-white p-3 text-xs font-semibold text-[#6b7280]">
                    Mostrando hasta 2000 pedidos; las métricas pueden estar truncadas.
                </p>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                {KPI_META.map((meta) => {
                    const value = meta.key === 'clients' ? newClientsInfo.count : meta.key === 'expenses' ? expensesData.total : kpis[meta.key];
                    const trendKey = meta.key === 'clients' ? null : resolveKpiTrendKey(meta.key);
                    const trend = meta.key === 'clients' ? newClientsInfo.trend : trends[trendKey];
                    const spark = kpiSparklines[resolveKpiSparkKey(meta.key)] ?? FLAT_SPARKLINE;
                    const loading = meta.key === 'clients' ? false : loadingAnalyticsOrders && kpis.count === 0;
                    const subtitle = meta.key === 'deliveryTotal'
                        ? `${(kpis.deliveryCount ?? 0).toLocaleString('es-CL')} pedido${(kpis.deliveryCount ?? 0) === 1 ? '' : 's'} · solo tarifas`
                        : undefined;
                    return (
                        <KpiCard
                            key={meta.key}
                            meta={meta}
                            value={value}
                            trend={trend}
                            sparklineValues={spark}
                            loading={loading}
                            fmt={fmt}
                            subtitle={subtitle}
                            showTrend={reportRange.hasComparison}
                        />
                    );
                })}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <Card className="flex flex-col">
                    <CardHeader className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
                        <CardTitle className="text-base font-semibold text-[#14161a]">Ventas por día</CardTitle>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex gap-1 rounded-xl bg-[#f5f5f7] p-1">
                                {CHART_KIND_OPTIONS.map(({ value, label, Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                                            activeChartKind === value
                                                ? 'bg-white text-[#e8483e] shadow-sm'
                                                : 'text-[#6b7280] hover:text-[#1a1a1a]'
                                        }`}
                                        onClick={() => setChartKind(value)}
                                        title={label}
                                        aria-pressed={activeChartKind === value}
                                    >
                                        <Icon size={14} strokeWidth={1.75} aria-hidden />
                                        <span className="hidden sm:inline">{label}</span>
                                    </button>
                                ))}
                            </div>
                            <Tabs value={chartTab} onValueChange={setChartTab}>
                                <TabsList className="h-9">
                                    <TabsTrigger value="all" className="text-xs">Todos</TabsTrigger>
                                    <TabsTrigger value="store" className="text-xs">Tienda</TabsTrigger>
                                    <TabsTrigger value="online" className="text-xs">Online</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-2">
                        {salesChartPoints.length ? (
                            <ReportSalesChart
                                points={salesChartPoints}
                                kind={activeChartKind}
                                filter={chartTab}
                                currency={currency}
                                height={400}
                            />
                        ) : (
                            <div className="flex h-[320px] flex-col items-center justify-center gap-3 text-center text-[#6b7280]">
                                <LineChart size={44} strokeWidth={1.5} className="text-[#e8483e]/55" aria-hidden />
                                <p className="text-base font-bold text-[#1a1a1a]">Sin datos de ventas</p>
                                <span className="max-w-[28ch] text-sm">No hay ventas en este período. Probá otro rango o canal.</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex flex-col gap-5">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CreditCard size={18} className="text-[#e8483e]" />
                                Métodos de pago
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ReportPaymentDonut
                                data={paymentDonutData}
                                currency={currency}
                            />
                            <div className="space-y-3">
                                {PAYMENT_META.map((pm) => {
                                    const value = paymentBreakdown[pm.key] || 0;
                                    const pct = kpis.total > 0 ? Math.round((value / kpis.total) * 100) : 0;
                                    const Icon = pm.Icon;
                                    return (
                                        <div key={pm.key} className="space-y-1.5">
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${pm.bg}`}>
                                                        <Icon size={14} style={{ color: pm.color }} />
                                                    </div>
                                                    <span className="font-semibold text-[#1a1a1a]">{pm.label}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-[#1a1a1a]">{fmt(value)}</p>
                                                    <p className="text-xs font-medium text-[#6b7280]">{pct}%</p>
                                                </div>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f7]">
                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pm.color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {peakHour && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#14161a]">
                                    <Clock size={18} className="text-[#e8483e]" />
                                    Hora pico
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <p className="text-2xl font-bold text-[#14161a]">{peakHour.hour}</p>
                                    <p className="text-xs font-medium text-[#6b7280]">{peakHour.count} pedidos en este horario</p>
                                </div>
                                <div className="space-y-2">
                                    {peakHourDistribution.map((b) => (
                                        <div key={b.label} className="flex items-center gap-3">
                                            <span className="w-20 text-xs font-medium text-[#6b7280]">{b.label}</span>
                                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f5f5f7]">
                                                <div
                                                    className="h-full rounded-full bg-[#e8483e] transition-all"
                                                    style={{ width: `${b.pct}%`, opacity: 0.25 + (b.pct / 100) * 0.75 }}
                                                />
                                            </div>
                                            <span className="w-8 text-right text-xs font-semibold text-[#14161a]">{b.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#14161a]">
                                <Users size={18} className="text-[#e8483e]" />
                                Clientes
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="relative h-20 w-20 shrink-0">
                                    <PieChart width={80} height={80}>
                                        <Pie
                                            data={clientsDonutData}
                                            cx={40}
                                            cy={40}
                                            innerRadius={26}
                                            outerRadius={38}
                                            dataKey="value"
                                            stroke="none"
                                            isAnimationActive={false}
                                        >
                                            {clientsDonutData.map((entry) => (
                                                <Cell key={entry.name} fill={entry.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <span className="text-xs font-bold text-[#14161a]">
                                            {newClientsInfo.total > 0 ? Math.round((newClientsInfo.count / newClientsInfo.total) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-[#6b7280]">Total registrados</span>
                                        <span className="font-bold text-[#14161a]">{newClientsInfo.total}</span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f7]">
                                        <div
                                            className="h-full rounded-full bg-[#e8483e] transition-all"
                                            style={{ width: `${newClientsInfo.total > 0 ? (newClientsInfo.count / newClientsInfo.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <p className="text-xs font-medium text-[#6b7280]">
                                        <strong className="text-[#14161a]">{newClientsInfo.count}</strong> nuevos ({reportRange.hasComparison ? reportRange.displayLabel : 'período'})
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {branchStats.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#14161a]">
                                    <MapPin size={18} className="text-[#e8483e]" />
                                    Ventas por Sucursal
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {branchStats.map((b) => {
                                    const pct = kpis.total > 0 ? Math.round((b.total / kpis.total) * 100) : 0;
                                    return (
                                        <div key={b.id} className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="truncate font-medium text-[#14161a]">{b.name}</span>
                                                <div className="shrink-0 text-right">
                                                    <p className="font-bold text-[#14161a]">{fmt(b.total)}</p>
                                                    <p className="text-xs font-medium text-[#6b7280]">{pct}%</p>
                                                </div>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f7]">
                                                <div
                                                    className="h-full rounded-full bg-[#e8483e] transition-all"
                                                    style={{ width: `${pct}%`, opacity: 0.25 + (pct / 100) * 0.75 }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-[#14161a]">
                        <Package size={20} className="text-[#e8483e]" />
                        Top productos vendidos
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingTopProducts ? (
                        <div className="py-8 text-center text-sm text-[#6b7280]">Cargando top productos…</div>
                    ) : topProducts.length === 0 ? (
                        <div className="py-8 text-center text-sm text-[#6b7280]">No hay datos de productos en este período.</div>
                    ) : (
                        <div className="space-y-4">
                            {topProducts.map((p, i) => {
                                const maxQty = topProducts[0]?.qty || 1;
                                const pct = Math.round((p.qty / maxQty) * 100);
                                const opacity = Math.max(0.25, pct / 100);
                                return (
                                    <div key={p.name} className="flex items-center gap-4">
                                        <span className="w-7 text-sm font-black text-[#e8483e]">#{i + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-[#14161a]">{p.name}</p>
                                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#f5f5f7]">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{ width: `${pct}%`, background: '#e8483e', opacity }}
                                                />
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-[#14161a]">{fmt(p.revenue)}</p>
                                            <p className="text-xs font-medium text-[#6b7280]">{p.qty} uds</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {monthlyExportBlock}

            <LocalExpenseModal
                isOpen={isAddExpenseModalOpen}
                onClose={() => setIsAddExpenseModalOpen(false)}
                branchId={selectedBranch?.id}
                branchName={selectedBranch?.name || selectedBranch?.label}
                activeShift={cashSystem?.activeShift}
                onConfirmOperating={handleConfirmRegisterLocalExpense}
                registerRefund={cashSystem?.registerRefund}
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
