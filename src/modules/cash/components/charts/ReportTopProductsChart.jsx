import React, { useMemo } from 'react';
import { formatMoney } from '@/shared/utils/money';

function intensityColor(pct) {
  // más oscuro/saturado = mayor venta, más claro = menor
  if (pct >= 0.9) return '#c31d2d';
  if (pct >= 0.7) return '#d63031';
  if (pct >= 0.5) return '#e8483e';
  if (pct >= 0.3) return '#f36f65';
  return '#ff9e97';
}

export default function ReportTopProductsChart({ products = [], currency = 'CLP', height = 260 }) {
  const data = useMemo(() => {
    const maxQty = Math.max(1, ...(products || []).map((p) => p.qty || 0));
    return (products || []).map((p) => ({
      ...p,
      pct: (p.qty || 0) / maxQty,
      fill: intensityColor((p.qty || 0) / maxQty),
    }));
  }, [products]);

  if (!data.length) return null;

  return (
    <div style={{ width: '100%', minHeight: height }} className="space-y-3 rounded-xl border border-[#e5e5ea] bg-white p-3">
      {data.map((item) => {
        const pct = Math.max(5, Math.round(item.pct * 100));
        return (
          <div key={item.name} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="max-w-[16rem] truncate font-semibold text-[#1a1a1a]">{item.name}</span>
              <span className="text-xs font-bold text-[#6b7280]">{item.qty} · {formatMoney(item.revenue, { currency })}</span>
            </div>
            <div className="h-3 rounded-full bg-[#f5f5f7]">
              <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: item.fill }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
