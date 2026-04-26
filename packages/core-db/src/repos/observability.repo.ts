import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type TraceRow = {
  traceId: string
  op: string
  durationMs: number
  status: 'ok' | 'error'
  errCode: string | null
  ts: number
  paramsBytes: number
  resultBytes: number
}

export type ModelReliabilityRow = {
  model: string
  role: string
  promptId: string
  hourBucket: number
  attempts: number
  parseFailures: number
  validationFailures: number
  repaired: number
  successes: number
}

export type RetrievalTraceRow = {
  id: string
  ts: number
  query: string
  hitCount: number
  topScore: number | null
  latencyMs: number
  hitsJson: string
}

export type TraceStat = {
  op: string
  p50: number
  p95: number
  count: number
  errorRate: number
}

export type ObservabilityRepo = {
  recordTrace(row: Omit<TraceRow, 'traceId'>): void
  queueTrace(row: Omit<TraceRow, 'traceId'>): void
  flushTraces(): void
  queryTraces(opts: {
    op?: string
    fromTs?: number
    toTs?: number
    slowOnlyMs?: number
    limit?: number
  }): TraceRow[]
  getTraceStats(fromTs: number, toTs: number): TraceStat[]
  pruneTraces(olderThanMs: number): void
  upsertReliability(row: ModelReliabilityRow): void
  getReliability(fromHourBucket?: number): ModelReliabilityRow[]
  pruneReliability(olderThanHourBucket: number): void
  recordRetrievalTrace(row: Omit<RetrievalTraceRow, 'id'>): void
  queryRetrievalTraces(opts: { fromTs?: number; limit?: number }): RetrievalTraceRow[]
  pruneRetrievalTraces(olderThanMs: number): void
}

export function createObservabilityRepo(sqlite: Database.Database): ObservabilityRepo {
  const _pending: Omit<TraceRow, 'traceId'>[] = []
  let _flushTimer: NodeJS.Timeout | null = null

  const insertTrace = sqlite.prepare<TraceRow>(`
    INSERT OR IGNORE INTO traces
      (trace_id, op, duration_ms, status, err_code, ts, params_bytes, result_bytes)
    VALUES
      (@traceId, @op, @durationMs, @status, @errCode, @ts, @paramsBytes, @resultBytes)
  `)

  const batchInsert = sqlite.transaction((rows: TraceRow[]) => {
    for (const row of rows) {
      insertTrace.run(row)
    }
  })

  function flushTraces(): void {
    if (_pending.length === 0) return
    const batch = _pending.splice(0, _pending.length)
    const rows = batch.map((r) => ({ ...r, traceId: randomUUID() }))
    batchInsert(rows)
  }

  function scheduledFlush(): void {
    flushTraces()
    _flushTimer = null
  }

  return {
    recordTrace(row) {
      insertTrace.run({ ...row, traceId: randomUUID() })
    },

    queueTrace(row) {
      _pending.push(row)
      if (_flushTimer === null) {
        _flushTimer = setTimeout(scheduledFlush, 500)
      }
    },

    flushTraces,

    queryTraces({ op, fromTs, toTs, slowOnlyMs, limit = 200 }) {
      const conditions: string[] = []
      const params: Record<string, unknown> = {}
      if (op) {
        conditions.push('op = @op')
        params['op'] = op
      }
      if (fromTs !== undefined) {
        conditions.push('ts >= @fromTs')
        params['fromTs'] = fromTs
      }
      if (toTs !== undefined) {
        conditions.push('ts <= @toTs')
        params['toTs'] = toTs
      }
      if (slowOnlyMs !== undefined) {
        conditions.push('duration_ms >= @slowOnlyMs')
        params['slowOnlyMs'] = slowOnlyMs
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const rows = sqlite
        .prepare(
          `SELECT trace_id, op, duration_ms, status, err_code, ts, params_bytes, result_bytes
           FROM traces ${where} ORDER BY ts DESC LIMIT ${limit}`,
        )
        .all(params) as Array<Record<string, unknown>>
      return rows.map((r) => ({
        traceId: r['trace_id'] as string,
        op: r['op'] as string,
        durationMs: r['duration_ms'] as number,
        status: r['status'] as 'ok' | 'error',
        errCode: (r['err_code'] as string | null) ?? null,
        ts: r['ts'] as number,
        paramsBytes: r['params_bytes'] as number,
        resultBytes: r['result_bytes'] as number,
      }))
    },

    getTraceStats(fromTs, toTs) {
      const rows = sqlite
        .prepare(`SELECT op, duration_ms, status FROM traces WHERE ts >= ? AND ts <= ? ORDER BY op`)
        .all(fromTs, toTs) as Array<{ op: string; duration_ms: number; status: string }>

      const byOp = new Map<string, number[]>()
      const errByOp = new Map<string, number>()
      for (const r of rows) {
        const list = byOp.get(r.op) ?? []
        list.push(r.duration_ms)
        byOp.set(r.op, list)
        if (r.status === 'error') {
          errByOp.set(r.op, (errByOp.get(r.op) ?? 0) + 1)
        }
      }

      const stats: TraceStat[] = []
      for (const [op, durations] of byOp.entries()) {
        durations.sort((a, b) => a - b)
        const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0
        const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0
        stats.push({
          op,
          p50,
          p95,
          count: durations.length,
          errorRate: (errByOp.get(op) ?? 0) / durations.length,
        })
      }
      return stats.sort((a, b) => b.p95 - a.p95)
    },

    pruneTraces(olderThanMs) {
      const cutoff = Date.now() - olderThanMs
      sqlite.prepare(`DELETE FROM traces WHERE ts < ?`).run(cutoff)
    },

    upsertReliability(row) {
      const id = `${row.model}:${row.role}:${row.promptId}:${row.hourBucket}`
      sqlite
        .prepare(
          `INSERT INTO model_reliability
             (id, model, role, prompt_id, hour_bucket,
              attempts, parse_failures, validation_failures, repaired, successes)
           VALUES (@id, @model, @role, @promptId, @hourBucket,
                   @attempts, @parseFailures, @validationFailures, @repaired, @successes)
           ON CONFLICT(id) DO UPDATE SET
             attempts = attempts + excluded.attempts,
             parse_failures = parse_failures + excluded.parse_failures,
             validation_failures = validation_failures + excluded.validation_failures,
             repaired = repaired + excluded.repaired,
             successes = successes + excluded.successes`,
        )
        .run({ ...row, id })
    },

    getReliability(fromHourBucket) {
      const rows = fromHourBucket
        ? (sqlite
            .prepare(
              `SELECT model, role, prompt_id, hour_bucket,
                      attempts, parse_failures, validation_failures, repaired, successes
               FROM model_reliability WHERE hour_bucket >= ? ORDER BY hour_bucket DESC`,
            )
            .all(fromHourBucket) as Array<Record<string, unknown>>)
        : (sqlite
            .prepare(
              `SELECT model, role, prompt_id, hour_bucket,
                      attempts, parse_failures, validation_failures, repaired, successes
               FROM model_reliability ORDER BY hour_bucket DESC`,
            )
            .all() as Array<Record<string, unknown>>)
      return rows.map((r) => ({
        model: r['model'] as string,
        role: r['role'] as string,
        promptId: r['prompt_id'] as string,
        hourBucket: r['hour_bucket'] as number,
        attempts: r['attempts'] as number,
        parseFailures: r['parse_failures'] as number,
        validationFailures: r['validation_failures'] as number,
        repaired: r['repaired'] as number,
        successes: r['successes'] as number,
      }))
    },

    pruneReliability(olderThanHourBucket) {
      sqlite.prepare(`DELETE FROM model_reliability WHERE hour_bucket < ?`).run(olderThanHourBucket)
    },

    recordRetrievalTrace(row) {
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO retrieval_traces
             (id, ts, query, hit_count, top_score, latency_ms, hits_json)
           VALUES (@id, @ts, @query, @hitCount, @topScore, @latencyMs, @hitsJson)`,
        )
        .run({ ...row, id: randomUUID() })
    },

    queryRetrievalTraces({ fromTs, limit = 100 }) {
      const rows = fromTs
        ? (sqlite
            .prepare(
              `SELECT id, ts, query, hit_count, top_score, latency_ms, hits_json
               FROM retrieval_traces WHERE ts >= ? ORDER BY ts DESC LIMIT ?`,
            )
            .all(fromTs, limit) as Array<Record<string, unknown>>)
        : (sqlite
            .prepare(
              `SELECT id, ts, query, hit_count, top_score, latency_ms, hits_json
               FROM retrieval_traces ORDER BY ts DESC LIMIT ?`,
            )
            .all(limit) as Array<Record<string, unknown>>)
      return rows.map((r) => ({
        id: r['id'] as string,
        ts: r['ts'] as number,
        query: r['query'] as string,
        hitCount: r['hit_count'] as number,
        topScore: (r['top_score'] as number | null) ?? null,
        latencyMs: r['latency_ms'] as number,
        hitsJson: r['hits_json'] as string,
      }))
    },

    pruneRetrievalTraces(olderThanMs) {
      const cutoff = Date.now() - olderThanMs
      sqlite.prepare(`DELETE FROM retrieval_traces WHERE ts < ?`).run(cutoff)
    },
  }
}
