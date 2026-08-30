import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { estimateProximity } from '../src/services/geocoding.service'

type PropertyRow = { id: string; latitude: number; longitude: number }

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
})
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

async function updateDistance(property: PropertyRow, workLatitude: number, workLongitude: number, calculatedAt: string) {
  const proximity = estimateProximity(workLatitude, workLongitude, property.latitude, property.longitude)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await db.from('leila_properties').update({
      work_distance_km: proximity.straightLineKm,
      estimated_road_distance_km: proximity.estimatedRoadKm,
      estimated_commute_minutes: proximity.estimatedMinutes,
      distance_calculated_at: calculatedAt,
    }).eq('id', property.id)
    if (!result.error) return
    if (result.error.code !== '57014' || attempt === 3) throw result.error
    await wait(attempt * 400)
  }
}

async function main() {
  const { data: settings, error: settingsError } = await db.from('leila_settings')
    .select('work_latitude,work_longitude')
    .not('work_latitude', 'is', null)
    .not('work_longitude', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (settingsError) throw settingsError
  if (!settings) throw new Error('Nenhum endereço de trabalho geocodificado foi encontrado')

  const now = new Date().toISOString()
  let updated = 0
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('leila_properties')
      .select('id,latitude,longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id')
      .range(from, from + 499)
    if (error) throw error
    if (!data?.length) break

    for (let index = 0; index < data.length; index += 10) {
      const chunk = data.slice(index, index + 10) as PropertyRow[]
      await Promise.all(chunk.map(property => updateDistance(
        property, Number(settings.work_latitude), Number(settings.work_longitude), now,
      )))
      updated += chunk.length
    }
    console.log(JSON.stringify({ event: 'progress', updated }))
    if (data.length < 500) break
  }
  console.log(JSON.stringify({ event: 'complete', updated }))
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error)
  process.exit(1)
})
