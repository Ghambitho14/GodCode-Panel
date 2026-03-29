"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

import { createSupabaseBrowserClient } from "../../utils/supabase/client";

interface TenantLoginFormProps {
	onAuthSuccessStart?: () => void | Promise<void>;
	showInlineLoading?: boolean;
}

export function TenantLoginForm({
	onAuthSuccessStart,
	showInlineLoading = true,
}: TenantLoginFormProps) {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (loading) return;
		setError(null);
		setLoading(true);

		try {
			const supabase = createSupabaseBrowserClient("tenant");
			const normalizedEmail = email.trim().toLowerCase();

			await supabase.auth.signOut();

			const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
				email: normalizedEmail,
				password,
			});

			if (signInError) {
				throw signInError;
			}

			const authUserId = signInData.user?.id ?? null;
			const allowedRoles = new Set(["owner", "admin", "ceo", "cashier"]);

			const { data: byAuth } = authUserId
				? await supabase
						.from("users")
						.select("id,role,company_id")
						.eq("auth_user_id", authUserId)
						.maybeSingle()
				: { data: null };

			let staffRow =
				byAuth && allowedRoles.has(String(byAuth.role ?? "").toLowerCase()) ? byAuth : null;

			if (!staffRow) {
				const { data: byEmail } = await supabase
					.from("users")
					.select("id,role,company_id")
					.ilike("email", normalizedEmail);

				staffRow =
					(byEmail ?? []).find((row: { role?: string | null; company_id?: string }) =>
						allowedRoles.has(String(row.role ?? "").toLowerCase()),
					) ?? null;
			}

			if (!staffRow?.company_id) {
				await supabase.auth.signOut();
				throw new Error("No se encontró un usuario autorizado para el panel.");
			}

			const { data: companyRow, error: companyError } = await supabase
				.from("companies")
				.select("id")
				.eq("id", staffRow.company_id)
				.maybeSingle();

			if (companyError || !companyRow?.id) {
				await supabase.auth.signOut();
				throw new Error("No se pudo validar la empresa asociada a tu cuenta.");
			}

			await onAuthSuccessStart?.();
			router.push("/admin");
			router.refresh();
		} catch (err) {
			const rawMessage =
				err instanceof Error ? err.message : "No se pudo iniciar sesion.";

			const message =
				rawMessage.toLowerCase().includes("invalid login credentials")
					? "Correo o contraseña incorrectos."
					: rawMessage.toLowerCase().includes("email not confirmed")
						? "Tu correo aun no ha sido confirmado."
						: rawMessage;

			setError(message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<form
			onSubmit={handleSubmit}
			className={`login-form ${loading && showInlineLoading ? "is-loading" : ""}`}
		>
			{loading && showInlineLoading ? (
				<div className="login-form-loading">
					<Loader2 size={20} className="animate-spin" />
					<span>Ingresando al panel...</span>
				</div>
			) : null}

			{error ? (
				<div className="login-error">
					<AlertCircle size={18} />
					<span>{error}</span>
				</div>
			) : null}

			<div className="form-group">
				<label>Correo Electrónico</label>
				<div className="input-with-icon">
					<Mail size={18} className="input-icon" />
					<input
						className="form-input"
						type="email"
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						inputMode="email"
						disabled={loading}
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="admin@godcode.me"
						required
					/>
				</div>
			</div>

			<div className="form-group">
				<label>Contraseña</label>
				<div className="input-with-icon">
					<Lock size={18} className="input-icon" />
					<input
						className="form-input"
						type={showPassword ? "text" : "password"}
						autoComplete="current-password"
						disabled={loading}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="••••••••"
						required
					/>
					<button
						type="button"
						className="login-password-toggle"
						onClick={() => setShowPassword((value) => !value)}
						disabled={loading}
						aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
					>
						{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
					</button>
				</div>
			</div>

			<button
				type="submit"
				className="btn btn-primary login-submit-button"
				disabled={loading}
			>
				{loading ? (
					<>
						<Loader2 size={20} className="animate-spin" />
						<span>Entrando...</span>
					</>
				) : (
					<span>Iniciar Sesión</span>
				)}
			</button>
		</form>
	);
}
