'use strict';

/**
 * AI Adapter — Meta Model API + provider generik.
 *
 * Kontrak:
 * - AI hanya memberi USULAN (klasifikasi/penjelasan). Accounting Engine tidak
 *   pernah memakai output mentah; harus lewat validateClassification dulu.
 * - API key TIDAK PERNAH di repository: dibaca dari argumen/env
 *   (BIGM_META_API_KEY) saat runtime. Tidak ada default key.
 * - Tanpa endpoint/key, adapter menolak dengan pesan jelas (fail-closed).
 * - FakeAIProvider tersedia untuk pengujian tanpa jaringan.
 */

class AIProvider {
  get name() {
    return 'base';
  }

  async classify(_summary) {
    throw new Error('AIProvider.classify not implemented');
  }

  async explain(_summary) {
    throw new Error('AIProvider.explain not implemented');
  }
}

class MetaModelAdapter extends AIProvider {
  constructor({ endpoint = null, apiKey = null, model = null, fetchImpl = null } = {}) {
    super();
    this.endpoint = endpoint ?? process.env.BIGM_META_API_URL ?? null;
    this.apiKey = apiKey ?? process.env.BIGM_META_API_KEY ?? null;
    this.model = model ?? process.env.BIGM_META_MODEL ?? 'meta-default';
    this._fetch = fetchImpl ?? globalThis.fetch;
  }

  get name() {
    return 'meta-model-api';
  }

  _requireConfig() {
    if (!this.endpoint) {
      throw new Error('Meta endpoint not configured (set BIGM_META_API_URL or pass endpoint)');
    }
    if (!this.apiKey) {
      throw new Error('Meta API key not configured (set BIGM_META_API_KEY env var; never commit keys)');
    }
    if (typeof this._fetch !== 'function') throw new Error('fetch implementation unavailable');
  }

  async _post(task, input) {
    this._requireConfig();
    const res = await this._fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, task, input }),
    });
    if (!res || res.ok !== true) {
      const status = res?.status ?? '?';
      throw new Error(`Meta API request failed (status ${status})`);
    }
    return res.json();
  }

  /** @returns {Promise<object>} usulan MENTAH — wajib divalidasi sebelum dipakai. */
  async classify(summary) {
    return this._post('classify-transaction', summary);
  }

  /** @returns {Promise<object>} penjelasan MENTAH — wajib divalidasi sebelum dipakai. */
  async explain(summary) {
    return this._post('explain-finance', summary);
  }
}

class FakeAIProvider extends AIProvider {
  constructor(handler) {
    super();
    if (typeof handler !== 'function') throw new Error('FakeAIProvider needs a handler(summary, task)');
    this._handler = handler;
  }

  get name() {
    return 'fake';
  }

  async classify(summary) {
    return this._handler(summary, 'classify-transaction');
  }

  async explain(summary) {
    return this._handler(summary, 'explain-finance');
  }
}

module.exports = { AIProvider, MetaModelAdapter, FakeAIProvider };
