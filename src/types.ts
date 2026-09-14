export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  invoiceDate: string; // DD/MM/YYYY
  dueDate: string; // DD/MM/YYYY (DATA di scadenza / pagamento)
  supplier: string; // Energentium, Enel, etc.
  service: string;
  customerCode?: string;
  pde?: string;
  podOrPdr?: string;
  period?: string;
  amount: number; // in euro
  recipient?: string;
  consumption?: string;
  fileName?: string;
  isIncoming?: boolean;
  source?: string;
}

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: 'pending' | 'analyzing' | 'success' | 'error' | 'cancelled';
  progress: number;
  errorMessage?: string;
  result?: InvoiceRecord;
}

export interface CsvRow {
  data: string;
  descrizione: string;
  uscite: string;
  entrate: string;
}
