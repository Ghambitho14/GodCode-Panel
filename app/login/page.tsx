import { redirect } from "next/navigation";

/** El login vive en la raíz `/` para que baste con abrir el host del panel. */
export default function LoginAliasPage() {
	redirect("/");
}
