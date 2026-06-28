import React, { createContext, useState, useEffect, useMemo, useRef } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import {
    BRANCHES_LIST_FIELD_KEYS,
    BRANCHES_LIST_SELECT,
    pickBranchListFields,
} from '@/modules/cash/services/branchSelects';

/** @param {Record<string, unknown>} b */
function mapBranchListItem(b) {
    const slim = pickBranchListFields(b);
    return {
        ...slim,
        whatsappUrl: b.whatsapp_url ?? b.whatsappUrl,
        instagramUrl: b.instagram_url ?? b.instagramUrl,
        mapUrl: b.map_url ?? b.mapUrl,
    };
}

export const LocationContext = createContext(null);

/** @param {string} storageKey */
function getInitialBranch(storageKey) {
    if (typeof window === 'undefined') {
        return { branch: null, hasValidBranch: false };
    }
    try {
        const saved = window.localStorage.getItem(storageKey);
        if (!saved) return { branch: null, hasValidBranch: false };
        const parsed = JSON.parse(saved);
        const slim = pickBranchListFields(parsed);
        const hasValid = !!(slim && slim.id && String(slim.id).length > 0);
        return { branch: hasValid ? slim : null, hasValidBranch: hasValid };
    } catch {
        return { branch: null, hasValidBranch: false };
    }
}

/**
 * @param {{ children: React.ReactNode, companyId: string }} props
 */
export const LocationProvider = ({ children, companyId }) => {
    const storageKey = useMemo(
        () => (companyId ? `godcode-selectedBranch:${companyId}` : 'godcode-selectedBranch:pending'),
        [companyId],
    );

    const initial = useMemo(() => getInitialBranch(storageKey), [storageKey]);

    const [selectedBranch, setSelectedBranch] = useState(initial.branch);
    const [allBranches, setAllBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(!initial.hasValidBranch);
    const fetchBranchesDebouncedRef = useRef(null);

    useEffect(() => {
        const next = getInitialBranch(storageKey);
        setSelectedBranch(next.branch);
        setIsLocationModalOpen(!next.hasValidBranch);
    }, [storageKey]);

    useEffect(() => {
        let alive = true;

        const fetchBranches = async () => {
            try {
                if (!companyId) {
                    if (!alive) return;
                    setAllBranches([]);
                    setLoadingBranches(false);
                    return;
                }

                const { data, error } = await supabase
                    .from(TABLES.branches)
                    .select(BRANCHES_LIST_SELECT)
                    .eq('company_id', companyId)
                    .order('name');

                if (error) throw error;

                const mappedBranches = (data || []).map((b) => mapBranchListItem(b));

                if (!alive) return;
                setAllBranches(mappedBranches);

                setSelectedBranch((prev) => {
                    if (!prev?.id) return prev;
                    const fresh = mappedBranches.find((b) => b.id === prev.id);
                    if (!fresh) {
                        try { window.localStorage.removeItem(storageKey); } catch {}
                        return null;
                    }
                    return pickBranchListFields(fresh);
                });
            } catch {
                /* ignore */
            } finally {
                if (!alive) return;
                setLoadingBranches(false);
            }
        };

        const scheduleFetchBranches = () => {
            if (fetchBranchesDebouncedRef.current) clearTimeout(fetchBranchesDebouncedRef.current);
            fetchBranchesDebouncedRef.current = setTimeout(() => {
                fetchBranchesDebouncedRef.current = null;
                void fetchBranches();
            }, 3000);
        };

        setLoadingBranches(true);
        fetchBranches();

        const channel = companyId
            ? supabase
                .channel(`branches-realtime-${companyId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: TABLES.branches },
                    (payload) => {
                        if (payload.eventType === 'UPDATE' && payload.new?.id) {
                            const incoming = mapBranchListItem(payload.new);
                            setAllBranches((prev) =>
                                prev.map((b) => (b.id === payload.new.id ? { ...b, ...incoming } : b))
                            );
                            setSelectedBranch((prev) => {
                                if (!prev?.id || prev.id !== payload.new.id) return prev;
                                const merged = pickBranchListFields({ ...prev, ...incoming });
                                const changed = BRANCHES_LIST_FIELD_KEYS.some(
                                    (key) => prev[key] !== merged[key]
                                );
                                if (changed) {
                                    try {
                                        window.localStorage.setItem(storageKey, JSON.stringify(merged));
                                    } catch {}
                                }
                                return merged;
                            });
                            return;
                        }
                        scheduleFetchBranches();
                    }
                )
                .subscribe()
            : null;

        return () => {
            alive = false;
            if (fetchBranchesDebouncedRef.current) {
                clearTimeout(fetchBranchesDebouncedRef.current);
                fetchBranchesDebouncedRef.current = null;
            }
            try {
                if (channel) supabase.removeChannel(channel);
            } catch {}
        };
    }, [companyId, storageKey]);

    useEffect(() => {
        if (!selectedBranch) {
            setIsLocationModalOpen(true);
        }
    }, [selectedBranch]);

    const selectBranch = (branch) => {
        const slim = pickBranchListFields(branch);
        setSelectedBranch(slim);
        try { window.localStorage.setItem(storageKey, JSON.stringify(slim)); } catch {}
        setIsLocationModalOpen(false);
    };

    const clearBranch = () => {
        setSelectedBranch(null);
        try { window.localStorage.removeItem(storageKey); } catch {}
        setIsLocationModalOpen(true);
    };

    return (
        <LocationContext.Provider value={{
            selectedBranch,
            selectBranch,
            clearBranch,
            isLocationModalOpen,
            setIsLocationModalOpen,
            allBranches,
            loadingBranches
        }}>
            {children}
        </LocationContext.Provider>
    );
};
