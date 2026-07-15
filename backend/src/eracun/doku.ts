// Klijent za doku (monoform d.o.o.) eRačun API — pristupna točka za Fiskalizaciju 2.0.
// Spec: https://api.doku.hr/openapi/v1.json (OpenAPI 3.1). Vidi docs/knowledge/13-*.
//
// Autentikacija (dva zaglavlja):
//   * Authorization: API-TOKEN <token>   — token PO doku RAČUNU (per-tenant, BYO-key)
//   * SOFTWARE-API-TOKEN: <guid>          — identifikator NAŠE integracije (globalan)
//
// Za slanje koristimo strukturirani JSON (/create) → doku sam gradi UBL 2.1 (HR CIUS)
// i potpisuje/šalje svojim certom. Alternativa je /upload (mi šaljemo gotov UBL) —
// ostavljeno za fazu vlastite generacije UBL-a (gap-analiza stavka 3).

export type DokuOkolina = 'test' | 'prod';

const BASE_URL: Record<DokuOkolina, string> = {
  test: 'https://api-test.doku.hr',
  prod: 'https://api.doku.hr',
};

// ── Model za /documents/invoices/outgoing/create (podskup UBLInvoiceCreatorDefinition) ──
export interface DokuStranka {
  endpointID?: string | null; // OIB/GLN vrijednost (elektronička adresa)
  endpointSchemeID?: 'OIB' | 'GLN' | null;
  name?: string | null;
  registrationName?: string | null;
  companyID?: string | null; // OIB/matični broj
  taxCompanyID?: string | null; // PDV ID (HR + OIB)
  operatorName?: string | null;
  operatorOIB?: string | null;
  address?: { streetName?: string | null; cityName?: string | null; postalZone?: string | null; countryCode?: string | null };
  contact?: { name?: string | null; email?: string | null };
}

export interface DokuStavka {
  item: {
    commodityClassification?: string | null; // npr. KPD vrijednost
    commodityClassificationListID?: string | null; // 'CG' za KPD (03-*/06-*)
    name: string;
    description?: string | null;
    quantity?: number;
    unitOfMeasure: string; // EN16931 unitCode (npr. 'H87')
    unitPrice?: number;
    taxCategory: string; // "S-25"/"S-13"/"S-5" ili goli kôd (Z/E/AE/O) — potvrđeno na TEST-u 2026-07-15
    taxExemptionReason?: string | null;
  };
}

export interface DokuInvoice {
  id: string; // broj računa
  profileID?: string | null;
  invoiceTypeCode: string; // UNTDID 1001, npr. '380'
  issueDate?: string; // YYYY-MM-DD
  dueDate?: string;
  documentCurrencyCode?: string | null; // 'EUR'
  buyerReference?: string | null;
  note?: string | null;
  supplier: DokuStranka;
  buyer: DokuStranka;
  payment?: {
    meansCode?: string | null; // UNTDID 4461 (30 = kreditni transfer, 48 = kartica, 10 = gotovina)
    financialAccountID?: string | null; // IBAN
    model?: string | null; // HR model (npr. 'HR00')
    id?: string | null; // poziv na broj
    instructionNote?: string | null;
    terms?: string | null;
  };
  references?: { order?: string | null; contract?: string | null; project?: string | null };
  lines: DokuStavka[];
}

// ── Odgovori ──
export interface DokuPosaljiOdgovor {
  id: number; // doku id dokumenta
  deliveryBlock: 'AMS' | null; // 'AMS' = primatelj nije registriran za eDelivery
  message: string | null;
}

export type DokuExchangeStatus = 'IMPORTED' | 'FISCALIZED' | 'DELIVERED';
export type DokuPaymentStatus = 'UNPAID' | 'PARTIAL' | 'COMPLETE' | 'OVERPAID';

export interface DokuStatusOdgovor {
  id: number;
  name: string;
  receiver: { name: string; oib: string };
  payableAmount?: number;
  currency: string;
  exchange: { status: DokuExchangeStatus | null; history: { status: string; timestamp: string }[] };
  payments: { status: DokuPaymentStatus | null; records: unknown[] };
}

export interface DokuRezultat<T> {
  ok: boolean;
  status: number; // HTTP status
  data?: T;
  greska?: string; // poruka greške (doku message ili transport)
}

export class DokuKlijent {
  private readonly base: string;
  constructor(
    private readonly accountToken: string,
    private readonly softwareToken: string,
    okolina: DokuOkolina,
  ) {
    this.base = BASE_URL[okolina];
  }

  private zaglavlja(): Record<string, string> {
    return {
      'Authorization': `API-TOKEN ${this.accountToken}`,
      'SOFTWARE-API-TOKEN': this.softwareToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async pozovi<T>(metoda: string, putanja: string, tijelo?: unknown): Promise<DokuRezultat<T>> {
    let odgovor: Response;
    try {
      odgovor = await fetch(`${this.base}${putanja}`, {
        method: metoda,
        headers: this.zaglavlja(),
        body: tijelo === undefined ? undefined : JSON.stringify(tijelo),
      });
    } catch (e) {
      return { ok: false, status: 0, greska: `Transport prema doku-u nije uspio: ${(e as Error).message}` };
    }
    const tekst = await odgovor.text();
    let json: unknown = null;
    if (tekst) {
      try {
        json = JSON.parse(tekst);
      } catch {
        // ne-JSON tijelo (npr. HTML greška proxyja) — ostavi kao null
      }
    }
    if (!odgovor.ok) {
      // doku validacijske greške nose detalje u `errors[]` (XSD/schematron poruke) —
      // bez njih je "Schematron validacija neuspješna (N)" nedijagnosticirljivo.
      const o = (json && typeof json === 'object' ? json : null) as { message?: string; Message?: string; errors?: { message?: string }[] } | null;
      const detalji = (o?.errors ?? []).map((e) => e.message).filter(Boolean).join(' | ');
      const poruka = [o?.message ?? o?.Message, detalji].filter(Boolean).join(': ') || tekst.slice(0, 300) || `HTTP ${odgovor.status}`;
      return { ok: false, status: odgovor.status, greska: poruka };
    }
    return { ok: true, status: odgovor.status, data: (json as T) ?? undefined };
  }

  // POST /documents/invoices/outgoing/create — doku gradi i šalje UBL.
  async posaljiRacun(invoice: DokuInvoice): Promise<DokuRezultat<DokuPosaljiOdgovor>> {
    return this.pozovi<DokuPosaljiOdgovor>('POST', '/documents/invoices/outgoing/create', { invoice });
  }

  // GET /documents/invoices/outgoing/{id} — status razmjene (exchange) i naplate.
  async dohvatiStatus(dokuId: number): Promise<DokuRezultat<{ data: DokuStatusOdgovor }>> {
    return this.pozovi<{ data: DokuStatusOdgovor }>('GET', `/documents/invoices/outgoing/${dokuId}`);
  }

  // POST /ams — je li primatelj registriran za eDelivery. 404 = nije registriran.
  async provjeriPrimatelja(identifier: string, scheme: 'OIB' | 'GLN' = 'OIB'): Promise<DokuRezultat<{ mpsEndpoint: string }>> {
    const r = await this.pozovi<{ mpsEndpoint: string }>('POST', '/ams', { scheme, identifier });
    if (r.status === 404) return { ok: true, status: 404 }; // "nije registriran" nije greška poziva
    return r;
  }

  // POST /accounts/me/ams — objavi tenanta na AMS-u za ZAPRIMANJE (429 = rate-limit).
  async registrirajZaZaprimanje(): Promise<DokuRezultat<{ message: string | null }>> {
    return this.pozovi<{ message: string | null }>('POST', '/accounts/me/ams');
  }

  // GET /ping — health/auth proba.
  async ping(): Promise<DokuRezultat<{ message: string }>> {
    return this.pozovi<{ message: string }>('GET', '/ping');
  }
}
