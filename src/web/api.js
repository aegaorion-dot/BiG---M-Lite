'use strict';

/**
 * Web API — router murni (tanpa framework) di atas web store.
 * Semua angka uang sebagai string minor (BigInt-safe); frontend tidak
 * menghitung akuntansi sendiri, hanya menampilkan hasil engine.
 */

function json(data, status = 200) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(data) };
}

function err(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function bearerToken(query, body) {
  const fromQuery = query && typeof query.token === 'string' ? query.token : null;
  const fromBody = body && typeof body.authToken === 'string' ? body.authToken : null;
  return fromBody ?? fromQuery ?? null;
}

async function handleApi(store, method, pathname, query, body) {
  const { ctx } = store;
  try {
    if (method === 'GET' && pathname === '/api/health') {
      return json({ ok: true, service: 'bigm-lite-web', framework: '0.1.0' });
    }
    if (method === 'GET' && pathname === '/api/summary') {
      return json({ ok: true, summary: store.summary(query.currency || 'IDR') });
    }
    if (method === 'GET' && pathname === '/api/transactions') {
      return json({ ok: true, transactions: store.listTransactions() });
    }
    if (method === 'POST' && pathname === '/api/sales') {
      const result = await store.createSale(body, { authToken: bearerToken(query, body) });
      return json({ ok: true, result: publicResult(result) }, 201);
    }
    if (method === 'POST' && pathname === '/api/purchases') {
      const result = await store.createPurchase(body, { authToken: bearerToken(query, body) });
      return json({ ok: true, result: publicResult(result) }, 201);
    }
    if (method === 'GET' && pathname === '/api/journals') {
      return json({ ok: true, journals: ctx.ledger.list().map((e) => store.serializeJournal(e)) });
    }
    if (method === 'GET' && pathname === '/api/ledger') {
      const currency = query.currency || ctx.org.baseCurrency;
      const balances = ctx.ledger.balances(currency);
      const out = [...balances.entries()].map(([accountId, money]) => {
        let code = null; let name = null;
        try { const a = ctx.chart.get(accountId); code = a.code; name = a.name; } catch { /* ignore */ }
        return { accountId, code, name, netMinor: money.amountMinor.toString(), netMajor: money.toMajorString() };
      });
      return json({ ok: true, currency, balances: out });
    }
    if (method === 'GET' && pathname === '/api/audit') {
      return json({ ok: true, verify: ctx.audit.verifyChain(), entries: ctx.audit.list() });
    }
    if (method === 'POST' && pathname === '/api/reversals') {
      const out = store.reverseJournal({ ...(body ?? {}), authToken: bearerToken(query, body) });
      return json({ ok: true, ...out }, 201);
    }
    if (method === 'GET' && pathname === '/api/reports/monthly') {
      return json({ ok: true, months: store.monthlyReport(query.currency || 'IDR') });
    }
    if (method === 'POST' && pathname === '/api/import/csv') {
      if (!body || typeof body.csv !== 'string') return err('body.csv (string) is required');
      const report = await store.importCsvText(body.csv, { authToken: bearerToken(query, body) });
      return json({ ok: true, report }, 201);
    }
    if (method === 'GET' && pathname === '/api/tax') {
      const packs = ctx.registry.list().map((p) => ({
        id: p.manifest.id, jurisdiction: p.manifest.jurisdiction, version: p.manifest.version,
        displayName: p.manifest.displayName ?? null, validFrom: p.manifest.validFrom,
        validTo: p.manifest.validTo, currency: p.manifest.currency,
        rules: p.rules.map((r) => ({
          id: r.id, category: r.category, description: r.description ?? null,
          placeholder: r.placeholder === true, source: r.source ?? null, note: r.note ?? null,
        })),
      }));
      return json({ ok: true, packs, note: 'Seluruh rule ID+SG masih PLACEHOLDER: tidak ada kewajiban pajak final.' });
    }
    if (method === 'GET' && pathname === '/api/onboarding/state') {
      return json({ ok: true, ...store.onboardingState(), ai: store.aiStatus() });
    }
    if (method === 'POST' && pathname === '/api/onboarding/turn') {
      const out = await store.onboardingTurn(String(body?.text ?? ''));
      return json({ ok: true, ...out }, 200);
    }
    if (method === 'POST' && pathname === '/api/onboarding/propose') {
      const out = store.onboardingPropose();
      if (!out.ok) return err(out.errors.join('; '), 400);
      return json({ ok: true, proposal: out.proposal });
    }
    if (method === 'POST' && pathname === '/api/onboarding/validate') {
      const out = store.onboardingValidate();
      if (!out.ok) return err(out.errors.join('; '), 400);
      return json({ ok: true, validated: out.validated });
    }
    if (method === 'POST' && pathname === '/api/onboarding/activate') {
      try {
        const record = store.onboardingActivate({ activationKey: body?.activationKey, actor: body?.actor ?? 'onboarding' });
        return json({ ok: true, record }, 201);
      } catch (e2) {
        return err(e2.message, 400);
      }
    }
    if (method === 'GET' && pathname === '/api/onboarding/history') {
      return json({ ok: true, history: store.onboardingHistory(), ai: store.aiStatus() });
    }
    if (method === 'GET' && pathname === '/api/settings') {
      return json({
        ok: true,
        org: ctx.org,
        periods: ctx.periods.list(),
        chart: ctx.chart.list(),
        pack: { id: ctx.pack.manifest.id, version: ctx.pack.manifest.version },
      });
    }
    if (method === 'POST' && pathname === '/api/demo/seed') {
      return json({ ok: true, ...(await store.seedDemo()) }, 201);
    }
    return err(`Unknown route ${method} ${pathname}`, 404);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (/Unauthorized/i.test(msg)) return err(msg, 401);
    const status = /Unknown|No country pack|not configured/i.test(msg) ? 404 : 400;
    return err(msg, status);
  }
}

function publicResult(result) {
  return {
    transactionId: result.transactionId,
    packId: result.packId,
    packVersion: result.packVersion,
    classification: result.classification,
    aiNote: result.aiNote,
    tax: result.tax,
    receipt: result.receipt,
    journal: result.journal,
    balances: result.balances,
  };
}

module.exports = { handleApi };
