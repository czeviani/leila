import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  estimateProximity, geocodeAddress, GeocodingProvider, propertyGeocodeQuery,
} from '../src/services/geocoding.service'

type PropertyRow = { id: string; address: string | null; city: string | null; state: string | null }

const args = new Set(process.argv.slice(2))
const valueAfter = (name: string) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const provider = (valueAfter('--provider') ?? (process.env.GEOAPIFY_API_KEY ? 'geoapify' : 'nominatim')) as GeocodingProvider
const limit = Number(valueAfter('--limit') ?? 10_000)
const delayMs = Number(valueAfter('--delay-ms') ?? (provider === 'nominatim' ? 1100 : 220))
const allProperties = args.has('--all')
const retryFailed = args.has('--retry-failed')

if (!['geoapify', 'nominatim'].includes(provider)) throw new Error('Provider inválido')
if (!Number.isFinite(limit) || limit < 1) throw new Error('Limite inválido')

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
})
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function loadTargets() {
  const rows: PropertyRow[] = []
  for (let from = 0; rows.length < limit; from += 500) {
    let query = db.from('leila_properties')
      .select('id,address,city,state')
      .eq('availability_status', 'available')
      .eq('is_active', true)
      .in('geocode_status', retryFailed ? ['pending', 'failed'] : ['pending'])
      .order('opportunity_score', { ascending: false, nullsFirst: false })
      .range(from, from + Math.min(499, limit - rows.length - 1))

    if (!allProperties) {
      query = query.ilike('property_type', 'apartamento')
        .gt('filter_area_m2', 60)
        .lt('auction_price', 1_500_000)
    }

    const { data, error } = await query
    if (error) throw error
    rows.push(...(data as PropertyRow[]))
    if (!data || data.length < 500) break
  }
  return rows.slice(0, limit)
}

async function main() {
  const { data: settings, error: settingsError } = await db.from('leila_settings')
    .select('work_latitude,work_longitude')
    .not('work_latitude', 'is', null)
    .not('work_longitude', 'is', null)
    .limit(1)
    .maybeSingle()
  if (settingsError) throw settingsError

  const targets = await loadTargets()
  let success = 0
  let approximate = 0
  let failed = 0
  console.log(JSON.stringify({ event: 'start', provider, targets: targets.length, allProperties, retryFailed }))

  for (let index = 0; index < targets.length; index += 1) {
    const property = targets[index]
    const query = propertyGeocodeQuery(property)
    try {
      const result = query ? await geocodeAddress(query, provider) : null
      if (!result) {
        failed += 1
        const { error } = await db.from('leila_properties').update({
          geocode_status: 'failed', geocode_provider: provider, geocode_query: query || null,
          geocoded_at: new Date().toISOString(),
        }).eq('id', property.id)
        if (error) throw error
      } else {
        const status = result.confidence >= 0.65 ? 'success' : 'approximate'
        const proximity = settings?.work_latitude != null && settings?.work_longitude != null
          ? estimateProximity(Number(settings.work_latitude), Number(settings.work_longitude), result.latitude, result.longitude)
          : null
        const { error } = await db.from('leila_properties').update({
          latitude: result.latitude,
          longitude: result.longitude,
          geocode_status: status,
          geocode_provider: result.provider,
          geocode_confidence: result.confidence,
          geocode_match_type: result.matchType,
          geocode_query: query,
          geocoded_at: new Date().toISOString(),
          work_distance_km: proximity?.straightLineKm ?? null,
          estimated_road_distance_km: proximity?.estimatedRoadKm ?? null,
          estimated_commute_minutes: proximity?.estimatedMinutes ?? null,
          distance_calculated_at: proximity ? new Date().toISOString() : null,
        }).eq('id', property.id)
        if (error) throw error
        if (status === 'success') success += 1
        else approximate += 1
      }
    } catch (error) {
      failed += 1
      console.error(JSON.stringify({ event: 'error', id: property.id, message: error instanceof Error ? error.message : String(error) }))
    }

    if ((index + 1) % 25 === 0 || index + 1 === targets.length) {
      console.log(JSON.stringify({ event: 'progress', processed: index + 1, total: targets.length, success, approximate, failed }))
    }
    if (index + 1 < targets.length) await wait(delayMs)
  }

  console.log(JSON.stringify({ event: 'complete', processed: targets.length, success, approximate, failed }))
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error)
  process.exit(1)
})
