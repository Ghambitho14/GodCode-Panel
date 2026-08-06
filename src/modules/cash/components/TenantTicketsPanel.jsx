import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
	Send, Plus, MessageSquare, LifeBuoy, Loader2, ChevronRight,
} from 'lucide-react';
import {
	listTickets as listTicketsService,
	createTicket as createTicketService,
	listMessages as listMessagesService,
	sendMessage as sendMessageService,
} from '../services/ticketsService';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const CATEGORY_OPTIONS = ['general', 'billing', 'technical', 'product', 'account'];

const PRIORITY_LABELS_ES = {
	low: 'Baja',
	medium: 'Media',
	high: 'Alta',
	critical: 'Crítica',
};
const CATEGORY_LABELS_ES = {
	general: 'General',
	billing: 'Facturación',
	technical: 'Técnico',
	product: 'Producto',
	account: 'Cuenta',
};
const STATUS_LABELS_ES = {
	open: 'Abierto',
	in_progress: 'En curso',
	waiting: 'En espera',
	pending: 'Pendiente',
	resolved: 'Resuelto',
	closed: 'Cerrado',
};

const MOBILE_VIEWS = [
	{ id: 'create', label: 'Nuevo' },
	{ id: 'list', label: 'Tickets' },
	{ id: 'thread', label: 'Chat' },
];

function labelPriorityEs(p) {
	const k = String(p ?? '').toLowerCase();
	return PRIORITY_LABELS_ES[k] ?? p;
}
function labelCategoryEs(c) {
	const k = String(c ?? '').toLowerCase();
	return CATEGORY_LABELS_ES[k] ?? c;
}
function labelStatusEs(s) {
	const k = String(s ?? 'open').toLowerCase();
	return STATUS_LABELS_ES[k] ?? s;
}

function ticketCreatedAt(t) {
	return t?.createdAt ?? t?.created_at ?? t?.lastMessageAt ?? t?.last_message_at ?? null;
}

function formatTicketDate(raw) {
	if (!raw) return null;
	const d = new Date(raw);
	if (!Number.isFinite(d.getTime())) return null;
	return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ticketStatusKey(t) {
	return String(t?.status ?? 'open').toLowerCase();
}

function statusBadgeClass(status) {
	const k = String(status ?? 'open').toLowerCase();
	if (k === 'resolved' || k === 'closed') return 'success';
	if (k === 'in_progress' || k === 'waiting' || k === 'pending') return 'warning';
	return 'neutral';
}

function priorityBadgeClass(priority) {
	const k = String(priority ?? 'medium').toLowerCase();
	if (k === 'critical') return 'danger';
	if (k === 'high') return 'warning';
	if (k === 'low') return 'neutral';
	return 'neutral';
}

/** API devuelve `message` + `author_type`; el UI histórico usaba `body` + `author`. */
function getMessageDisplay(m) {
	const raw =
		typeof m.message === 'string'
			? m.message
			: typeof m.body === 'string'
				? m.body
				: '';
	const body = raw.trim() ? raw : '(Sin texto)';
	const t = m.author_type;
	const isSupport = t === 'super_admin' || m.author === 'Soporte';
	let author = typeof m.author === 'string' && m.author ? m.author : '';
	if (!author) {
		if (isSupport) author = 'Soporte';
		else if (t === 'system') author = 'Sistema';
		else if (m.author_email) author = String(m.author_email).split('@')[0] || 'Tú';
		else author = 'Tú';
	}
	return { body, author, isSupport };
}

export default function TenantTicketsPanel({ showNotify }) {
	const [tickets, setTickets] = React.useState([]);
	const [selectedTicketId, setSelectedTicketId] = React.useState(null);
	const [messages, setMessages] = React.useState([]);
	const [messagesLoading, setMessagesLoading] = React.useState(false);
	const [reply, setReply] = React.useState('');
	const [loading, setLoading] = React.useState(true);
	const [saving, setSaving] = React.useState(false);
	const [mobileView, setMobileView] = React.useState('list');

	const [subject, setSubject] = React.useState('');
	const [description, setDescription] = React.useState('');
	const [priority, setPriority] = React.useState('medium');
	const [category, setCategory] = React.useState('general');

	const [isClient, setIsClient] = React.useState(false);

	React.useEffect(() => {
		setIsClient(true);
		void fetchTickets();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	React.useEffect(() => {
		if (selectedTicketId) void fetchMessages(selectedTicketId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedTicketId]);

	async function fetchTickets() {
		setLoading(true);
		try {
			const items = await listTicketsService();
			setTickets(Array.isArray(items) ? items : []);
		} catch (error) {
			if (showNotify) void showNotify(error instanceof Error ? error.message : 'Error al cargar tickets', 'error');
			console.error('Error fetching tickets:', error);
		}
		setLoading(false);
	}

	async function createTicket() {
		if (!subject.trim() || !description.trim()) {
			if (showNotify) void showNotify('Completa asunto y descripción', 'error');
			return;
		}
		setSaving(true);
		try {
			const result = await createTicketService({ subject, description, priority, category });
			setSubject('');
			setDescription('');
			await fetchTickets();
			const created = result?.ticket;
			if (created?.id) {
				setSelectedTicketId(created.id);
				setMobileView('thread');
			} else {
				setMobileView('list');
			}
			if (showNotify) void showNotify('Ticket creado', 'success');
		} catch (error) {
			if (showNotify) void showNotify(error instanceof Error ? error.message : 'Error al crear ticket', 'error');
			console.error('Error creating ticket:', error);
		}
		setSaving(false);
	}

	async function sendReply() {
		if (!reply.trim() || !selectedTicketId) {
			if (showNotify) void showNotify('Escribe una respuesta', 'error');
			return;
		}
		setSaving(true);
		try {
			await sendMessageService(selectedTicketId, reply);
			setReply('');
			await fetchMessages(selectedTicketId);
			if (showNotify) void showNotify('Respuesta enviada', 'success');
		} catch (error) {
			if (showNotify) void showNotify(error instanceof Error ? error.message : 'Error al enviar respuesta', 'error');
			console.error('Error sending reply:', error);
		}
		setSaving(false);
	}

	async function fetchMessages(ticketId) {
		setMessagesLoading(true);
		try {
			const items = await listMessagesService(ticketId);
			setMessages(Array.isArray(items) ? items : []);
		} catch (error) {
			if (showNotify) void showNotify(error instanceof Error ? error.message : 'Error al cargar mensajes', 'error');
			console.error('Error fetching messages:', error);
		}
		setMessagesLoading(false);
	}

	const selectTicket = (ticketId) => {
		setSelectedTicketId(ticketId);
		setMobileView('thread');
	};

	const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

	if (!isClient) return null;

	return (
		<section className="tenant-tickets-panel animate-fade" aria-label="Panel de soporte y tickets">
			<div className="tenant-tickets-shell">
				<header className="tenant-tickets-shell__header">
					<div className="tenant-tickets-shell__title">
						<LifeBuoy size={20} strokeWidth={1.75} aria-hidden />
						<h2>Soporte</h2>
					</div>
					<p className="tenant-tickets-shell__hint">
						Crea un ticket y conversa con el equipo GodCode. Respuesta habitual en 1–2 días hábiles.
					</p>
				</header>

				<div className="tenant-tickets-mobile-tabs" role="tablist" aria-label="Secciones de soporte">
					{MOBILE_VIEWS.map((view) => (
						<button
							key={view.id}
							type="button"
							role="tab"
							aria-selected={mobileView === view.id}
							className={`tenant-tickets-mobile-tabs__btn${mobileView === view.id ? ' is-active' : ''}`}
							onClick={() => setMobileView(view.id)}
						>
							{view.label}
						</button>
					))}
				</div>

				<div className="tenant-tickets-grid">
					<aside
						className={`tenant-tickets-col tenant-tickets-col--create${mobileView === 'create' ? ' is-mobile-active' : ''}`}
						role="form"
						aria-labelledby="ticket-create-title"
					>
						<div className="tenant-tickets-col__head">
							<h3 id="ticket-create-title">Nuevo ticket</h3>
							<p>Cuéntanos el problema con el mayor detalle posible.</p>
						</div>
						<div className="tenant-tickets-form">
							<div className="tenant-tickets-field">
								<label htmlFor="ticket-subject">Asunto</label>
								<input
									id="ticket-subject"
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
									placeholder="Ej. No puedo publicar cambios en el menú"
									className="form-input"
									maxLength={120}
								/>
							</div>
							<div className="tenant-tickets-field">
								<label htmlFor="ticket-description">Descripción</label>
								<textarea
									id="ticket-description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Qué pasó, en qué pantalla, sucursal y pasos para reproducirlo…"
									rows={4}
									className="form-input tenant-tickets-textarea"
								/>
								<p className="tenant-tickets-field__hint">Incluye capturas o datos útiles en el texto si puedes.</p>
							</div>
							<div className="tenant-tickets-form__row">
								<div className="tenant-tickets-field">
									<label htmlFor="ticket-category">Categoría</label>
									<select
										id="ticket-category"
										value={category}
										onChange={(e) => setCategory(e.target.value)}
										className="form-input"
									>
										{CATEGORY_OPTIONS.map((option) => (
											<option key={option} value={option}>{CATEGORY_LABELS_ES[option] ?? option}</option>
										))}
									</select>
								</div>
								<div className="tenant-tickets-field">
									<label htmlFor="ticket-priority">Prioridad</label>
									<select
										id="ticket-priority"
										value={priority}
										onChange={(e) => setPriority(e.target.value)}
										className="form-input"
									>
										{PRIORITY_OPTIONS.map((option) => (
											<option key={option} value={option}>{PRIORITY_LABELS_ES[option] ?? option}</option>
										))}
									</select>
								</div>
							</div>
							<Button
								variant="default"
								type="button"
								size="sm"
								className="tenant-tickets-submit-btn"
								onClick={() => void createTicket()}
								disabled={saving}
							>
								{saving ? (
									<><Loader2 size={16} className="animate-spin" aria-hidden /> Guardando…</>
								) : (
									<><Plus size={16} aria-hidden /> Crear ticket</>
								)}
							</Button>
						</div>
					</aside>

					<aside
						className={`tenant-tickets-col tenant-tickets-col--list${mobileView === 'list' ? ' is-mobile-active' : ''}`}
						role="region"
						aria-label="Lista de tickets"
					>
						<div className="tenant-tickets-col__head tenant-tickets-col__head--row">
							<div>
								<h3>Mis tickets</h3>
								<span className="tenant-tickets-count">{tickets.length}</span>
							</div>
						</div>
						<div className="tenant-tickets-list-scroll">
							{loading ? (
								<div className="tenant-tickets-empty">
									<Loader2 size={22} className="animate-spin" aria-hidden />
									<p>Cargando tickets…</p>
								</div>
							) : tickets.length === 0 ? (
								<div className="tenant-tickets-empty">
									<MessageSquare size={28} strokeWidth={1.5} aria-hidden />
									<p>No tienes tickets aún.</p>
									<p className="tenant-tickets-empty__sub">Crea uno desde «Nuevo».</p>
								</div>
							) : (
								<ul className="tenant-tickets-list">
									{tickets.map((t) => {
										const dateStr = formatTicketDate(ticketCreatedAt(t));
										const statusKey = ticketStatusKey(t);
										return (
											<li key={t.id}>
												<button
													type="button"
													className={`tenant-tickets-list-item${selectedTicketId === t.id ? ' is-selected' : ''}`}
													onClick={() => selectTicket(t.id)}
												>
													<div className="tenant-tickets-list-item__top">
														<span className="tenant-tickets-list-item__subject">{t.subject}</span>
														{selectedTicketId === t.id ? (
															<ChevronRight size={16} aria-hidden className="tenant-tickets-list-item__chevron" />
														) : null}
													</div>
													{dateStr ? (
														<span className="tenant-tickets-list-item__date">{dateStr}</span>
													) : null}
													<div className="tenant-tickets-list-item__meta">
														<span className={`status-badge ${statusBadgeClass(statusKey)}`}>
															{labelStatusEs(statusKey)}
														</span>
														<span className="status-badge neutral">{labelCategoryEs(t.category)}</span>
														<span className={`status-badge ${priorityBadgeClass(t.priority)}`}>
															{labelPriorityEs(t.priority)}
														</span>
													</div>
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</div>
					</aside>

					<main
						className={`tenant-tickets-col tenant-tickets-col--thread${mobileView === 'thread' ? ' is-mobile-active' : ''}`}
						role="region"
						aria-label="Conversación del ticket"
					>
						{selectedTicket ? (
							<>
								<div className="tenant-tickets-thread-head">
									<h3>{selectedTicket.subject}</h3>
									<div className="tenant-tickets-thread-head__meta">
										<span className={`status-badge ${statusBadgeClass(ticketStatusKey(selectedTicket))}`}>
											{labelStatusEs(ticketStatusKey(selectedTicket))}
										</span>
										<span className="status-badge neutral">{labelCategoryEs(selectedTicket.category)}</span>
										<span className={`status-badge ${priorityBadgeClass(selectedTicket.priority)}`}>
											{labelPriorityEs(selectedTicket.priority)}
										</span>
									</div>
								</div>

								<div className="tenant-tickets-messages" aria-live="polite">
									{messagesLoading ? (
										<div className="tenant-tickets-empty tenant-tickets-empty--inline">
											<Loader2 size={18} className="animate-spin" aria-hidden />
											<p>Cargando mensajes…</p>
										</div>
									) : messages.length === 0 ? (
										<div className="tenant-tickets-empty tenant-tickets-empty--inline">
											<MessageSquare size={32} strokeWidth={1.5} aria-hidden />
											<p>Aún no hay mensajes en este ticket.</p>
										</div>
									) : (
										messages.map((m) => {
											const { body, author, isSupport } = getMessageDisplay(m);
											return (
												<div
													key={m.id}
													className={`tenant-tickets-message${isSupport ? ' is-support' : ' is-tenant'}`}
												>
													<div className="tenant-tickets-message__head">
														<span className="tenant-tickets-message__author">{author}</span>
														{m.created_at ? (
															<span className="tenant-tickets-message__time">
																{new Date(m.created_at).toLocaleString('es-CL', {
																	day: '2-digit',
																	month: 'short',
																	hour: '2-digit',
																	minute: '2-digit',
																})}
															</span>
														) : null}
													</div>
													<p className="tenant-tickets-message__body">{body}</p>
												</div>
											);
										})
									)}
								</div>

								<div className="tenant-tickets-reply">
									<label htmlFor="ticket-reply" className="sr-only">Tu respuesta</label>
									<textarea
										id="ticket-reply"
										value={reply}
										onChange={(e) => setReply(e.target.value)}
										placeholder="Escribe tu respuesta…"
										className="form-input tenant-tickets-textarea"
										rows={3}
									/>
									<div className="tenant-tickets-reply__actions">
										<Button
											variant="default"
											type="button"
											size="sm"
											onClick={() => void sendReply()}
											disabled={saving || !reply.trim()}
										>
											{saving ? (
												<><Loader2 size={16} className="animate-spin" aria-hidden /> Enviando…</>
											) : (
												<><Send size={16} aria-hidden /> Enviar</>
											)}
										</Button>
									</div>
								</div>
							</>
						) : (
							<div className="tenant-tickets-empty tenant-tickets-empty--thread">
								<MessageSquare size={40} strokeWidth={1.4} aria-hidden />
								<p>Selecciona un ticket para ver la conversación.</p>
								<p className="tenant-tickets-empty__sub">O crea uno nuevo si necesitas ayuda.</p>
							</div>
						)}
					</main>
				</div>
			</div>
		</section>
	);
}
