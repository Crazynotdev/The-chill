export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SCANNER';
export type TicketStatus = 'ACTIVE' | 'USED' | 'REVOKED' | 'EXPIRED';
export type ScanMode = 'ENTRY' | 'CHECK';
export type ScanResultCode =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID'
  | 'REVOKED'
  | 'EXPIRED'
  | 'EVENT_INACTIVE';

/** Ticket tel qu'exposé au client : `token_hash` n'en sort jamais. */
export interface TicketRow {
  id: string;
  event_id: string;
  ticket_code: string;
  participant_name: string;
  status: TicketStatus;
  issued_at: string;
  issued_by: string | null;
  validated_at: string | null;
  validated_by: string | null;
  validation_location: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanTicketInfo {
  ticket_code: string;
  participant_name: string;
  status: TicketStatus;
  issued_at: string;
  validated_at: string | null;
  validation_location: string | null;
  event_name: string;
}

export interface ScanResponse {
  result: ScanResultCode;
  mode: ScanMode;
  ticket: ScanTicketInfo | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
