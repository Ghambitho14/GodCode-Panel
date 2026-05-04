"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** El login vive en la raíz `/` para que baste con abrir el host del panel. */
export default function LoginAliasPage() {
	const router = useRouter();
	useEffect(() => {
		router.replace("/");
	}, [router]);
	return null;
}
