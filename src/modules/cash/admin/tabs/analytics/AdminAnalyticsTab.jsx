import React, { useMemo } from 'react';
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
