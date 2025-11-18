export interface MedicalSource {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  pmcid?: string;
  doi?: string;
  abstract?: string;
  url?: string;
}

export interface SourcesResponse {
  sources: MedicalSource[];
  isPremium: boolean;
  totalAvailable: number;
}

export interface PaymentVerification {
  verified: boolean;
  txHash?: string;
  amount?: string;
  from?: string;
  blockNumber?: number;
}
