import React, { useMemo } from 'react';
import AdminErrorBoundary from '../../../components/AdminErrorBoundary';
import AdminTabFallback from '../../../components/AdminTabFallback';
import { useAdmin } from '../../pages/AdminProvider';

const AdminAnalytics = React.lazy(() => import('../../../components/AdminAnalytics'));

export default function AdminLocalExpensesTab({ logoUrl, companyName }) {
	const {
		selectedBranch,
		branches,
		orders,
		products,
		clients,
		refreshAllData,
		showNotify,
		resolvedTabLabels,
		companyId,
	} = useAdmin();

	const companyIdForClients = useMemo(() => {
		if (selectedBranch && selectedBranch.id !== 'all' && selectedBranch.company_id) {
			return selectedBranch.company_id;
		}
		const fallback = (branches || []).find((b) => b.id !== 'all' && b.company_id);
		return fallback?.company_id || companyId || null;
	}, [selectedBranch, branches, companyId]);

	const tabLabels = resolvedTabLabels || {};

	return (
		<AdminErrorBoundary
			tabLabel={tabLabels.local_expenses || 'Gastos del local'}
			onRetry={() => void refreshAllData()}
		>
			<React.Suspense fallback={<AdminTabFallback />}>
				<AdminAnalytics
					orders={orders}
					products={products}
					clients={clients}
					branches={(branches || []).filter((b) => b.id !== 'all')}
					showNotify={showNotify}
					companyId={companyIdForClients}
					selectedBranch={selectedBranch}
					logoUrl={logoUrl}
					companyName={companyName}
					view="expensesOnly"
				/>
			</React.Suspense>
		</AdminErrorBoundary>
	);
}
