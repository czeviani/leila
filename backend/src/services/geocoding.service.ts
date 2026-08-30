export type GeocodingProvider = 'geoapify' | 'nominatim'

export interface GeocodingResult {
  latitude: number
  longitude: number
  confidence: number
  matchType: string
  formattedAddress: string | null
  provider: GeocodingProvider
}

export interface ProximityEstimate {
  straightLineKm: number
  estimatedRoadKm: number
  estimatedMinutes: number
}

const clampConfidence = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback
}

const nominatimConfidence = (result: Record<string, unknown>) => {
  const type = String(result.type ?? '')
  if (['house', 'building', 'apartments', 'residential'].includes(type)) return 0.9
  if (['road', 'street'].includes(type)) return 0.7
  if (['suburb', 'neighbourhood', 'quarter'].includes(type)) return 0.5
  return clampConfidence(result.importance, 0.35)
}

async function geocodeWithGeoapify(query: string, apiKey: string): Promise<GeocodingResult | null> {
  const url = new URL('https://api.geoapify.com/v1/geocode/search')
  url.searchParams.set('text', query)
  url.searchParams.set('filter', 'countrycode:br')
  url.searchParams.set('limit', '1')
  url.searchParams.set('format', 'json')
  url.searchParams.set('apiKey', apiKey)

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Geoapify respondeu ${response.status}`)
  const payload = await response.json() as { results?: Array<Record<string, unknown>> }
  const result = payload.results?.[0]
  if (!result) return null

  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const rank = (result.rank ?? {}) as Record<string, unknown>
  return {
    latitude,
    longitude,
    confidence: clampConfidence(rank.confidence, 0.5),
    matchType: String(result.result_type ?? result.category ?? 'unknown'),
    formattedAddress: typeof result.formatted === 'string' ? result.formatted : null,
    provider: 'geoapify',
  }
}

async function geocodeWithNominatim(query: string): Promise<GeocodingResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('countrycodes', 'br')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '1')

  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': process.env.LEILA_GEOCODING_USER_AGENT
        ?? 'LeilaRadar/1.0 (contact: caiquezeviani@gmail.com)',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Nominatim respondeu ${response.status}`)
  const payload = await response.json() as Array<Record<string, unknown>>
  const result = payload[0]
  if (!result) return null

  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    latitude,
    longitude,
    confidence: nominatimConfidence(result),
    matchType: String(result.type ?? 'unknown'),
    formattedAddress: typeof result.display_name === 'string' ? result.display_name : null,
    provider: 'nominatim',
  }
}

export async function geocodeAddress(
  query: string,
  preferredProvider?: GeocodingProvider,
): Promise<GeocodingResult | null> {
  const geoapifyKey = process.env.GEOAPIFY_API_KEY?.trim()
  const provider = preferredProvider ?? (geoapifyKey ? 'geoapify' : 'nominatim')
  if (provider === 'geoapify') {
    if (!geoapifyKey) throw new Error('GEOAPIFY_API_KEY não configurada')
    return geocodeWithGeoapify(query, geoapifyKey)
  }
  return geocodeWithNominatim(query)
}

const toRadians = (degrees: number) => degrees * Math.PI / 180

export function estimateProximity(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
): ProximityEstimate {
  const earthRadiusKm = 6371.0088
  const latitudeDelta = toRadians(destinationLatitude - originLatitude)
  const longitudeDelta = toRadians(destinationLongitude - originLongitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(originLatitude)) * Math.cos(toRadians(destinationLatitude))
    * Math.sin(longitudeDelta / 2) ** 2
  const straightLineKm = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const estimatedRoadKm = straightLineKm * 1.25
  const averageSpeedKmh = estimatedRoadKm <= 30 ? 25 : estimatedRoadKm <= 100 ? 45 : 70

  return {
    straightLineKm: Math.round(straightLineKm * 100) / 100,
    estimatedRoadKm: Math.round(estimatedRoadKm * 100) / 100,
    estimatedMinutes: Math.max(1, Math.round(estimatedRoadKm / averageSpeedKmh * 60)),
  }
}

export function propertyGeocodeQuery(property: {
  address?: string | null
  city?: string | null
  state?: string | null
}) {
  const normalizedAddress = property.address?.replace(/\bN[º°.]?\s*/gi, '').replace(/\s+/g, ' ').trim()
  const addressParts = normalizedAddress?.split(',').map(part => part.trim()).filter(Boolean) ?? []
  const unitIndex = addressParts.findIndex(part => /^(?:ap(?:to|artamento)?\.?|bloco|torre|andar|pavimento|unidade|vaga)\b/i.test(part))
  const neighborhood = unitIndex >= 0 ? addressParts.at(-1) : null
  const simplifiedAddress = unitIndex >= 0
    ? [...addressParts.slice(0, unitIndex), neighborhood].filter(Boolean).join(', ')
    : normalizedAddress
  return [simplifiedAddress, property.city, property.state, 'Brasil']
    .map(part => part?.trim())
    .filter(Boolean)
    .join(', ')
}
