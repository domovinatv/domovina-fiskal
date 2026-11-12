// D1 pristupni sloj. Svi upiti su scoped na tenant_id gdje ima smisla —
// multi-tenant izolacija se provodi ovdje, ne u pozivateljima.
//
// Barrel: postojeći `import … from '../db'` i dalje radi; moduli po domeni.

export * from './tenant';
export * from './prostor';
export * from './certifikat';
export * from './doku';
export * from './racun';
export * from './fiskal';
export * from './nadzor';
export * from './katalog';
export * from './greske';
