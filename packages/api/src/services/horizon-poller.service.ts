/**
 * Horizon Poller — background job that polls Stellar Horizon for contract events
 * and dispatches them to registered webhook subscribers.
 *
 * Polls every POLL_INTERVAL_MS (default 30s). Tracks the last processed paging
 * token in memory so restarts re-process from the last known position.
 */
import { logger } from '../config/logger.js'
import { publishEvent } from './webhook.service.js'

const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
const REGISTRY_CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID ?? ''
const MARKET_CONTRACT_ID = process.env.MARKET_CONTRACT_ID ?? ''
const POLL_INTERVAL_MS = 30_000

let lastPagingToken: string | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null

/** Map Horizon contract event topics to internal event names */
function resolveEventName(contractId: string, topic: string): string | null {
  if (contractId === REGISTRY_CONTRACT_ID) {
    if (topic === 'register') return 'worker.registered'
    if (topic === 'toggle') return 'worker.toggled'
  }
  if (contractId === MARKET_CONTRACT_ID) {
    if (topic === 'tip') return 'tip.sent'
  }
  return null
}

async function fetchContractEvents(contractId: string): Promise<void> {
  if (!contractId) return

  const url = new URL(`${HORIZON_URL}/contracts/${contractId}/events`)
  url.searchParams.set('order', 'asc')
  url.searchParams.set('limit', '50')
  if (lastPagingToken) url.searchParams.set('cursor', lastPagingToken)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    logger.warn({ status: res.status, contractId }, 'Horizon events fetch failed')
    return
  }

  const json = (await res.json()) as {
    _embedded?: { records: Array<{ id: string; type: string; contract_id: string; topic: string[]; value: unknown; paging_token: string }> }
  }

  const records = json._embedded?.records ?? []
  for (const record of records) {
    const topic = record.topic?.[0] ?? ''
    const eventName = resolveEventName(record.contract_id, topic)
    if (eventName) {
      await publishEvent(eventName, {
        contractId: record.contract_id,
        topic: record.topic,
        value: record.value,
        eventId: record.id,
      }).catch((err) => logger.error({ err, eventName }, 'Failed to publish webhook event'))
    }
    lastPagingToken = record.paging_token
  }
}

async function poll(): Promise<void> {
  try {
    await Promise.all([
      fetchContractEvents(REGISTRY_CONTRACT_ID),
      fetchContractEvents(MARKET_CONTRACT_ID),
    ])
  } catch (err) {
    logger.warn({ err }, 'Horizon poll error')
  } finally {
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
  }
}

/** Start the Horizon polling background job */
export function startHorizonPoller(): void {
  if (!REGISTRY_CONTRACT_ID && !MARKET_CONTRACT_ID) {
    logger.info('Horizon poller skipped — no contract IDs configured (REGISTRY_CONTRACT_ID / MARKET_CONTRACT_ID)')
    return
  }
  logger.info({ REGISTRY_CONTRACT_ID, MARKET_CONTRACT_ID }, 'Starting Horizon poller')
  pollTimer = setTimeout(poll, 0)
}

/** Stop the Horizon polling background job (useful in tests) */
export function stopHorizonPoller(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}
