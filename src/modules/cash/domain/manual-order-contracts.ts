export type MinorAmount = number & { readonly __minorAmount: unique symbol };
export type ManualOrderMode = 'quick_sale' | 'session';
export type Fulfillment = 'table' | 'pickup' | 'delivery';
export type PaymentTiming = 'immediate' | 'deferred';
export type PaymentRail = 'cash' | 'card' | 'online';
export type EvidencePolicy = 'none' | 'optional' | 'required';
export type SettlementTrigger =
	| 'cash_confirmation'
	| 'pos_confirmation'
	| 'evidence_uploaded'
	| 'manual_verification'
	| 'gateway_webhook';

export type CustomerRequirementSet = {
	name: boolean;
	phone: boolean;
	document: boolean;
	address: boolean;
	zone: boolean;
	operatorReference: boolean;
};

export type ManualOrderSettings = {
	version: 1;
	currencyFractionDigits?: number;
	enabledFulfillments: Record<Fulfillment, boolean>;
	customerRequirements: Record<Fulfillment, CustomerRequirementSet>;
	cashDenominations?: Record<string, number[]>;
	allowImmediateSessionPayment: { table: false; pickup: boolean; delivery: boolean };
};

export type PaymentMethodDefinition = {
	id: string;
	label: string;
	rail: PaymentRail;
	currency: string;
	evidencePolicy: EvidencePolicy;
	settlementTrigger: SettlementTrigger;
	settlementCurrency?: string;
	allowMixedPayment?: boolean;
	enabled: boolean;
};

export type PaymentLine = {
	id: string;
	methodId: string;
	rail: PaymentRail;
	amountMinor: MinorAmount;
	currency: string;
	settlementAmountMinor?: MinorAmount;
	settlementCurrency?: string;
	exchangeRate?: string;
	evidencePolicy: EvidencePolicy;
	settlementTrigger?: SettlementTrigger;
	tenderedAmountMinor?: MinorAmount;
	tenderedCurrency?: string;
	changeAmountMinor?: MinorAmount;
};

export type PaymentEvidenceStatus =
	| 'pending'
	| 'uploading'
	| 'uploaded'
	| 'pending_verification'
	| 'verified'
	| 'rejected'
	| 'failed';
