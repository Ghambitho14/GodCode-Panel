import React from 'react';
import { Minus, Plus, StickyNote, Trash2, UtensilsCrossed } from 'lucide-react';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { spacing, textScale } from './manualOrderStyles';

const CartItemCard = ({
    item,
    updateQuantity,
    removeItem,
    updateItemNote,
    isItemNoteOpen,
    toggleItemNote,
}) => {
    const { formatMoney } = useOrderMoney();
    const hasDiscount = Boolean(item.has_discount) && item.discount_price != null && Number(item.discount_price) > 0;
    const unit = hasDiscount ? Number(item.discount_price) : Number(item.price);
    const subtotal = unit * Number(item.quantity || 1);
    const noteOpen = isItemNoteOpen(item);

    const handleMinus = (e) => {
        e.stopPropagation();
        if (item.quantity === 1) {
            removeItem(item.id);
        } else {
            updateQuantity(item.id, -1);
        }
    };

    const handlePlus = (e) => {
        e.stopPropagation();
        updateQuantity(item.id, 1);
    };

    const handleRemove = (e) => {
        e.stopPropagation();
        removeItem(item.id);
    };

    return (
        <div key={item.id} className="border-b border-dashed border-gc-border/60 py-2.5 last:border-b-0">
            {/* Fila principal tipo recibo */}
            <div className="flex items-center gap-3">
                <UtensilsCrossed size={14} className="flex-shrink-0 text-gc-text-muted" aria-hidden />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className={`${textScale.body} truncate font-medium text-gc-text`} title={item.name}>
                        {item.name}
                    </span>
                    <span className={`${textScale.body} text-gc-text-muted`}>x{item.quantity}</span>
                </div>
                <span className={`${textScale.body} font-bold text-gc-text`}>
                    {formatMoney(subtotal)}
                </span>
            </div>

            {/* Controles compactos */}
            <div className="mt-1.5 flex items-center justify-between pl-7">
                <div className="flex items-center gap-1">
                    <Button variant="outline"
                        type="button"
                        onClick={handleMinus}
                        className="flex h-6 w-6 items-center justify-center rounded-full border-gc-border bg-gc-card p-0 text-gc-text transition-colors hover:bg-gc-muted"
                        aria-label="Reducir cantidad"
                    >
                        <Minus size={12} strokeWidth={2.5} />
                    </Button>
                    <span className={`min-w-[1.25rem] text-center ${textScale.body} font-bold text-gc-text tabular-nums`}>
                        {item.quantity}
                    </span>
                    <Button variant="default"
                        type="button"
                        onClick={handlePlus}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-gc-accent p-0 text-sm leading-none text-white transition-colors hover:bg-gc-accent-hover"
                        aria-label="Aumentar cantidad"
                    >
                        <Plus size={12} strokeWidth={2.5} />
                    </Button>
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="outline"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleItemNote(item.id); }}
                        className={cn(
                            `flex h-6 w-6 items-center justify-center rounded-full border p-0 transition-colors`,
                            (item.note ?? '').length > 0
                                ? 'border-gc-accent bg-gc-accent/10 text-gc-accent'
                                : 'border-gc-border bg-gc-card text-gc-text-muted hover:border-gc-accent/30 hover:text-gc-accent',
                        )}
                        title={(item.note ?? '').length > 0 ? 'Editar comentario' : 'Agregar comentario para cocina'}
                        aria-label={(item.note ?? '').length > 0 ? 'Editar comentario' : 'Agregar comentario para cocina'}
                        aria-pressed={noteOpen}
                    >
                        <StickyNote size={12} />
                    </Button>
                    <Button variant="destructive"
                        type="button"
                        onClick={handleRemove}
                        className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-gc-card p-0 text-gc-text-muted transition-colors hover:bg-gc-danger/10 hover:text-gc-danger"
                        title="Eliminar ítem"
                        aria-label="Eliminar ítem"
                    >
                        <Trash2 size={12} />
                    </Button>
                </div>
            </div>

            {noteOpen && (
                <div className="mt-2 pl-7">
                    <textarea
                        className={`w-full rounded-[4px] border border-gc-border bg-gc-card p-2 ${textScale.body} text-gc-text placeholder:text-gc-text-muted focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/20`}
                        value={item.note ?? ''}
                        onChange={(e) => updateItemNote(item.id, e.target.value)}
                        placeholder="Ej: sin cebolla, salsa aparte. Máx. 140 caracteres."
                        maxLength={140}
                        rows={2}
                        aria-label={`Comentario para ${item.name}`}
                    />
                    <span className={`mt-1 block text-right ${textScale.micro} text-gc-text-muted`}>
                        {(item.note ?? '').length}/140
                    </span>
                </div>
            )}
        </div>
    );
};

export default React.memo(CartItemCard);
