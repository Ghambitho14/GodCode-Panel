import React, { useMemo, useRef } from 'react';
import AdminTabFallback from '../../../components/AdminTabFallback';
import { useAdmin } from '../../pages/AdminProvider';

const AdminAnalytics = React.lazy(() => import('../../../components/AdminAnalytics'));

export default function AdminAnalyticsTab() {
	const {
		selectedBranch,
		branches,
		orders,
		products,
		clients,
		showNotify,
		companyId,
	} = useAdmin();

	const companyIdForClients = useMemo(() => {
		if (selectedBranch && selectedBranch.id !== 'all' && selectedBranch.company_id) {
			return selectedBranch.company_id;
		}
		const fallback = (branches || []).find((b) => b?.id !== 'all' && b?.company_id);
		return fallback?.company_id || companyId || null;
	}, [selectedBranch, branches, companyId]);

	const renderCountRef = useRef(0);
	const prevInputsRef = useRef(null);
	renderCountRef.current += 1;
	const inputs = {
		selectedBranchId: selectedBranch?.id,
		selectedBranchTime: selectedBranch?.updated_at,
		ordersLength: orders?.length,
		ordersRef: orders,
		companyIdForClients,
		productsLength: products?.length,
		clientsLength: clients?.length,
		branchesLength: branches?.length,
	};
	if (prevInputsRef.current) {
		const prev = prevInputsRef.current;
		const changed = Object.keys(inputs).filter((k) => inputs[k] !== prev[k]);
		if (changed.length > 0) {
			console.log(
				'[AdminAnalyticsTab] render #%s changed: %s',
				renderCountRef.current,
				changed.join(', '),
			);
		}
	}
	prevInputsRef.current = inputs;
	console.log(
		'[AdminAnalyticsTab] render #%s selectedBranch.id=%s orders.length=%s companyId=%s',
		renderCountRef.current,
		selectedBranch?.id,
		orders?.length,
		companyIdForClients,
	);

	return (
		<React.Suspense fallback={<AdminTabFallback />}>
			<AdminAnalytics
				orders={orders}
				products={products}
				clients={clients}
				branches={(branches || []).filter((b) => b?.id && b.id !== 'all')}
				showNotify={showNotify}
				companyId={companyIdForClients}
				selectedBranch={selectedBranch}
				view="full"
			/>
		</React.Suspense>
	);
}
