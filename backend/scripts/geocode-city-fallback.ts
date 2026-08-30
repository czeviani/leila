import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { estimateProximity, geocodeAddress, GeocodingProvider } from '../src/services/geocoding.service'

type PropertyRow = { id: string; city: string | null; state: string | null }
type CityGroup = { city: string; state: string; ids: string[] }

const provider = (process.env.GEOAPIFY_API_KEY ? 'geoapify' : 'nominatim') as GeocodingProvider
const delayMs = provider === 'nominatim' ? 1100 : 220
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function main() {
  const { data, error } = await db.from('leila_properties')
    .select('id,city,state')
    .eq('availability_status', 'available')
    .eq('is_active', true)
    .ilike('property_type', 'apartamento')
    .gt('filter_area_m2', 60)
    .lt('auction_price', 1_500_000)
    .eq('geocode_status', 'failed')
  if (error) throw error

  const { data: settings, error: settingsError } = await db.from('leila_settings')
    .select('work_latitude,work_longitude').not('work_latitude', 'is', null).not('work_longitude', 'is', null)
    .limit(1).maybeSingle()
  if (settingsError) throw settingsError

  const groups = new Map<string, CityGroup>()
  for (const property of (data ?? []) as PropertyRow[]) {
    if (!property.city || !property.state) continue
    const key = `${property.city}|${property.state}`.toLocaleLowerCase('pt-BR')
    const group = groups.get(key) ?? { city: property.city, state: property.state, ids: [] }
    group.ids.push(property.id)
    groups.set(key, group)
  }

  let resolvedCities = 0
  let updatedProperties = 0
  let unresolvedCities = 0
  console.log(JSON.stringify({ event: 'start', provider, cities: groups.size, properties: data?.length ?? 0 }))

  for (const [index, group] of [...groups.values()].entries()) {
    const query = `${group.city}, ${group.state}, Brasil`
    try {
      const result = await geocodeAddress(query, provider)
      if (!result) {
        unresolvedCities += 1
      } else {
        const proximity = settings?.work_latitude != null && settings?.work_longitude != null
          ? estimateProximity(Number(settings.work_latitude), Number(settings.work_longitude), result.latitude, result.longitude)
          : null
        for (let start = 0; start < group.ids.length; start += 100) {
          const { error: updateError } = await db.from('leila_properties').update({
            latitude: result.latitude,
            longitude: result.longitude,
            geocode_status: 'approximate',
            geocode_provider: result.provider,
            geocode_confidence: Math.min(result.confidence, 0.25),
            geocode_match_type: 'city',
            geocode_query: query,
            geocoded_at: new Date().toISOString(),
            work_distance_km: proximity?.straightLineKm ?? null,
            estimated_road_distance_km: proximity?.estimatedRoadKm ?? null,
            estimated_commute_minutes: proximity?.estimatedMinutes ?? null,
            distance_calculated_at: proximity ? new Date().toISOString() : null,
          }).in('id', group.ids.slice(start, start + 100))
          if (updateError) throw updateError
        }
        resolvedCities += 1
        updatedProperties += group.ids.length
      }
    } catch (error) {
      unresolvedCities += 1
      console.error(JSON.stringify({ event: 'error', city: group.city, state: group.state, message: error instanceof Error ? error.message : String(error) }))
    }
    if ((index + 1) % 10 === 0 || index + 1 === groups.size) {
      console.log(JSON.stringify({ event: 'progress', processedCities: index + 1, totalCities: groups.size, resolvedCities, updatedProperties, unresolvedCities }))
    }
    if (index + 1 < groups.size) await wait(delayMs)
  }
  console.log(JSON.stringify({ event: 'complete', resolvedCities, updatedProperties, unresolvedCities }))
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
