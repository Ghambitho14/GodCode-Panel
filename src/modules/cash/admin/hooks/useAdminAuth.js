import { useState, useRef, useCallback, useEffect } from 'react';

import { supabase, TABLES, bootstrapSession, getCurrentUser, logout, onAuthEvent } from '@/integrations/supabase';

import { normalizePanelUserRole } from '@/shared/constants/admin-panel-tabs';

import { clearPanelSessionStorage, invalidateAll } from '../../services/panelCatalogCache';

import { invalidateAllPanelData } from '../../services/panelDataCache';

import { invalidateAllBranchSettings } from '../../services/branchSettingsCache';
import { clearCompanyIntegrationCache } from '../../services/branchSettingsService';



const ALLOWED_ROLES = ['owner', 'admin', 'ceo', 'cashier'];



/**

 * Autenticación y verificación de rol del panel admin.

 */

export function useAdminAuth({

	companyId,

	initialUserRole,

	initialAssignedBranchId,

	navigate,

	showNotify,

	onForceReloadAfterLogin,

}) {

	const [userRole, setUserRole] = useState(() => normalizePanelUserRole(initialUserRole));

	const [userEmail, setUserEmail] = useState(null);

	const [assignedBranchId, setAssignedBranchId] = useState(initialAssignedBranchId ?? null);



	const initialAuthSnapshotRef = useRef(

		initialUserRole

			? { role: initialUserRole, branchId: initialAssignedBranchId ?? null, consumed: false }

			: null,

	);

	const verifyAdminAccessTimerRef = useRef(null);

	const pendingForceLoadRef = useRef(false);

	const authVerifiedRef = useRef(Boolean(initialUserRole));

	const onForceReloadAfterLoginRef = useRef(onForceReloadAfterLogin);

	const showNotifyRef = useRef(showNotify);

	const companyIdRef = useRef(companyId);

	const navigateRef = useRef(navigate);



	useEffect(() => {

		onForceReloadAfterLoginRef.current = onForceReloadAfterLogin;

		showNotifyRef.current = showNotify;

		companyIdRef.current = companyId;

		navigateRef.current = navigate;

	});



	const clearAllPanelCaches = useCallback(() => {

		clearPanelSessionStorage();

		invalidateAll();

		invalidateAllPanelData();

		invalidateAllBranchSettings();

		clearCompanyIntegrationCache();

	}, []);



	const verifyAdminAccessCore = useCallback(async () => {

		if (authVerifiedRef.current && !pendingForceLoadRef.current) {

			return;

		}



		let user = getCurrentUser();

		if (!user?.email) {

			user = await bootstrapSession();

			if (!user?.email) {

				authVerifiedRef.current = false;

				setUserRole(null);

				setUserEmail(null);

				setAssignedBranchId(null);

				navigateRef.current('/');

				return;

			}

		}



		setUserEmail(user.email.trim().toLowerCase());



		const seed = initialAuthSnapshotRef.current;

		if (seed && !seed.consumed) {

			seed.consumed = true;

			const effectiveRole = normalizePanelUserRole(seed.role);

			if (effectiveRole && ALLOWED_ROLES.includes(effectiveRole)) {

				setUserRole(effectiveRole);

				setAssignedBranchId(seed.branchId || null);

				authVerifiedRef.current = true;

				if (pendingForceLoadRef.current) {

					pendingForceLoadRef.current = false;

					onForceReloadAfterLoginRef.current?.();

				}

				return;

			}

		}



		const { data: userRowByAuth, error: userByAuthError } = await supabase

			.from(TABLES.users)

			.select('role,branch_id,company_id')

			.eq('auth_user_id', user.id || '')

			.maybeSingle();



		if (userByAuthError) {

			authVerifiedRef.current = false;

			setUserRole(null);

			setAssignedBranchId(null);

			showNotifyRef.current('No se pudieron validar tus permisos de usuario', 'error');

			return;

		}



		let userRow = userRowByAuth;



		if (!userRow) {

			const normalizedEmail = user.email.trim().toLowerCase();

			const { data: userRowByEmail, error: userByEmailError } = await supabase

				.from(TABLES.users)

				.select('role,branch_id,company_id')

				.ilike('email', normalizedEmail)

				.eq('company_id', companyIdRef.current)

				.maybeSingle();



			if (userByEmailError) {

				authVerifiedRef.current = false;

				setUserRole(null);

				setAssignedBranchId(null);

				showNotifyRef.current('No se pudieron validar tus permisos de usuario', 'error');

				return;

			}



			userRow = userRowByEmail;

		}



		if (!userRow?.company_id) {

			authVerifiedRef.current = false;

			setUserRole(null);

			setAssignedBranchId(null);

			showNotifyRef.current('Tu usuario no está asociado a una empresa.', 'error');

			return;

		}



		if (String(userRow.company_id) !== String(companyIdRef.current)) {

			authVerifiedRef.current = false;

			setUserRole(null);

			setAssignedBranchId(null);

			await logout();

			navigateRef.current('/');

			showNotifyRef.current('Tu cuenta no pertenece a esta empresa.', 'error');

			return;

		}



		const effectiveRole = normalizePanelUserRole(userRow?.role);

		const hasAllowedRole = Boolean(effectiveRole && ALLOWED_ROLES.includes(effectiveRole));



		if (!hasAllowedRole) {

			authVerifiedRef.current = false;

			setUserRole(null);

			setAssignedBranchId(null);

			await logout();

			navigateRef.current('/');

			showNotifyRef.current('No tienes permisos de administrador para este local', 'error');

			return;

		}



		setUserRole(effectiveRole);

		setAssignedBranchId(userRow?.branch_id || null);

		authVerifiedRef.current = true;



		if (pendingForceLoadRef.current) {

			pendingForceLoadRef.current = false;

			onForceReloadAfterLoginRef.current?.();

		}

	}, []);



	const verifyAdminAccess = useCallback(() => {

		if (authVerifiedRef.current && !pendingForceLoadRef.current) return;

		if (verifyAdminAccessTimerRef.current) {

			clearTimeout(verifyAdminAccessTimerRef.current);

		}

		verifyAdminAccessTimerRef.current = setTimeout(() => {

			verifyAdminAccessTimerRef.current = null;

			void verifyAdminAccessCore();

		}, 400);

	}, [verifyAdminAccessCore]);



	useEffect(() => {

		verifyAdminAccess();



		const unsubscribe = onAuthEvent((event) => {

			if (event === 'signed_in') {

				authVerifiedRef.current = false;

				pendingForceLoadRef.current = true;

				clearAllPanelCaches();

				verifyAdminAccess();

			}

			if (event === 'signed_out') {

				authVerifiedRef.current = false;

				clearAllPanelCaches();

				setUserRole(null);

				setUserEmail(null);

				setAssignedBranchId(null);

				navigateRef.current('/');

			}

		});



		return () => {

			if (verifyAdminAccessTimerRef.current) {

				clearTimeout(verifyAdminAccessTimerRef.current);

				verifyAdminAccessTimerRef.current = null;

			}

			unsubscribe();

		};

	}, [verifyAdminAccess, clearAllPanelCaches]);



	const signOut = useCallback(async () => {
		await logout();
	}, []);



	return {

		userRole,

		setUserRole,

		userEmail,

		assignedBranchId,

		setAssignedBranchId,

		verifyAdminAccess,

		signOut,

	};

}

