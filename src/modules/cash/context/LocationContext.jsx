import React, { createContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import { subscribeMonitored, closeMonitoredChannel } from '@/shared/subscribeMonitored';
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
    if (typeof window === 'undefined') return null;
    try {
        const saved = window.localStorage.getItem(storageKey);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        const slim = pickBranchListFields(parsed);
        return slim && slim.id && String(slim.id).length > 0 ? slim : null;
    } catch {
        return null;
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

    const [selectedBranch, setSelectedBranch] = useState(initial);
    const [allBranches, setAllBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const fetchBranchesDebouncedRef = useRef(null);
    const fetchBranchesRef = useRef(/** @type {null | (() => Promise<void>)} */ (null));

    useEffect(() => {
        setSelectedBranch(getInitialBranch(storageKey));
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

        fetchBranchesRef.current = fetchBranches;

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
            ? subscribeMonitored(
                supabase
                    .channel(`branches-realtime-${companyId}`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: TABLES.branches },
                        (payload) => {
                        const rowCompanyId = payload.new?.company_id ?? payload.old?.company_id ?? null;
                        if (rowCompanyId && companyId && String(rowCompanyId) !== String(companyId)) {
                            return;
                        }
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
                ),
                { name: 'branches', context: { companyId } },
            )
            : null;

        return () => {
            alive = false;
            fetchBranchesRef.current = null;
            if (fetchBranchesDebouncedRef.current) {
                clearTimeout(fetchBranchesDebouncedRef.current);
                fetchBranchesDebouncedRef.current = null;
            }
            try {
                if (channel) closeMonitoredChannel(supabase, channel);
            } catch {}
        };
    }, [companyId, storageKey]);

    const selectBranch = useCallback((branch) => {
        const slim = pickBranchListFields(branch);
        setSelectedBranch(slim);
        try { window.localStorage.setItem(storageKey, JSON.stringify(slim)); } catch {}
    }, [storageKey]);

    const refetchBranches = useCallback(() => {
        if (fetchBranchesRef.current) return fetchBranchesRef.current();
        return Promise.resolve();
    }, []);

    const value = useMemo(() => ({
        selectedBranch,
        selectBranch,
        allBranches,
        loadingBranches,
        refetchBranches,
    }), [selectedBranch, selectBranch, allBranches, loadingBranches, refetchBranches]);

    return (
        <LocationContext.Provider value={value}>
            {children}
        </LocationContext.Provider>
    );
};
