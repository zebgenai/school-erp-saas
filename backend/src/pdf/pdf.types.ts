export interface SchoolPdfInfo {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
}

export interface PdfMeta {
  docNo: string;
  title: string;
  generatedAt?: Date;
}
