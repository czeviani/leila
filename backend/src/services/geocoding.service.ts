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

const interpolate = (value: number, points: Array<{ axis: number; position: number }>) => {
  const ordered = [...points].sort((a, b) => a.axis - b.axis)
  if (value <= ordered[0].axis) return ordered[0].position
  if (value >= ordered[ordered.length - 1].axis) return ordered[ordered.length - 1].position
  const upperIndex = ordered.findIndex(point => point.axis >= value)
  const lower = ordered[upperIndex - 1]
  const upper = ordered[upperIndex]
  const progress = (value - lower.axis) / (upper.axis - lower.axis)
  return lower.position + (upper.position - lower.position) * progress
}

const pinheirosLongitudeAt = (latitude: number) => interpolate(latitude, [
  { axis: -23.70, position: -46.703 },
  { axis: -23.65, position: -46.719 },
  { axis: -23.60, position: -46.707 },
  { axis: -23.57, position: -46.700 },
  { axis: -23.54, position: -46.723 },
  { axis: -23.51, position: -46.750 },
])

const tieteLatitudeAt = (longitude: number) => interpolate(longitude, [
  { axis: -46.82, position: -23.487 },
  { axis: -46.72, position: -23.515 },
  { axis: -46.62, position: -23.526 },
  { axis: -46.52, position: -23.510 },
  { axis: -46.42, position: -23.492 },
])

function saoPauloBarrierCrossings(
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
) {
  let crossings = 0
  const withinPinheiros = [originLatitude, destinationLatitude].every(latitude => latitude >= -23.71 && latitude <= -23.50)
  if (withinPinheiros) {
    const originSide = originLongitude - pinheirosLongitudeAt(originLatitude)
    const destinationSide = destinationLongitude - pinheirosLongitudeAt(destinationLatitude)
    if (originSide * destinationSide < 0) crossings += 1
  }

  const withinTiete = [originLongitude, destinationLongitude].every(longitude => longitude >= -46.83 && longitude <= -46.41)
  if (withinTiete) {
    const originSide = originLatitude - tieteLatitudeAt(originLongitude)
    const destinationSide = destinationLatitude - tieteLatitudeAt(destinationLongitude)
    if (originSide * destinationSide < 0) crossings += 1
  }
  return crossings
}

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
  const bothInSaoPauloMetro = [originLatitude, destinationLatitude].every(latitude => latitude >= -24.0 && latitude <= -23.2)
    && [originLongitude, destinationLongitude].every(longitude => longitude >= -47.1 && longitude <= -46.2)

  let estimatedRoadKm: number
  let estimatedMinutes: number
  if (bothInSaoPauloMetro) {
    const latitudeKm = Math.abs(destinationLatitude - originLatitude) * 111.32
    const meanLatitude = (originLatitude + destinationLatitude) / 2
    const longitudeKm = Math.abs(destinationLongitude - originLongitude) * 111.32 * Math.cos(toRadians(meanLatitude))
    const urbanGridKm = latitudeKm + longitudeKm
    const gridFactor = straightLineKm <= 15 ? 1.12 : straightLineKm <= 30 ? 1.08 : 1.04
    const barrierCrossings = saoPauloBarrierCrossings(
      originLatitude, originLongitude, destinationLatitude, destinationLongitude,
    )
    const localAccessKm = straightLineKm <= 30 ? 0.6 : 0.3
    const barrierDetourKm = barrierCrossings * 0.6
    estimatedRoadKm = Math.max(straightLineKm * 1.18, urbanGridKm * gridFactor + localAccessKm + barrierDetourKm)

    const averageSpeedKmh = estimatedRoadKm <= 5 ? 18
      : estimatedRoadKm <= 15 ? 22
        : estimatedRoadKm <= 30 ? 25
          : estimatedRoadKm <= 60 ? 32
            : 48
    const localTrafficMinutes = estimatedRoadKm <= 30 ? 4 : 2
    estimatedMinutes = Math.max(1, Math.round(estimatedRoadKm / averageSpeedKmh * 60 + localTrafficMinutes + barrierCrossings * 5))
  } else {
    const roadFactor = straightLineKm <= 30 ? 1.28 : straightLineKm <= 100 ? 1.18 : 1.12
    estimatedRoadKm = straightLineKm * roadFactor
    const averageSpeedKmh = estimatedRoadKm <= 30 ? 28 : estimatedRoadKm <= 100 ? 50 : 72
    estimatedMinutes = Math.max(1, Math.round(estimatedRoadKm / averageSpeedKmh * 60))
  }

  return {
    straightLineKm: Math.round(straightLineKm * 100) / 100,
    estimatedRoadKm: Math.round(estimatedRoadKm * 100) / 100,
    estimatedMinutes,
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
