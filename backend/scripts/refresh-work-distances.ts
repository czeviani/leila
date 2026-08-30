import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { estimateProximity } from '../src/services/geocoding.service'

type PropertyRow = { id: string; latitude: number; longitude: number }

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
})

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

    for (let index = 0; index < data.length; index += 50) {
      const chunk = data.slice(index, index + 50) as PropertyRow[]
      const results = await Promise.all(chunk.map(property => {
        const proximity = estimateProximity(
          Number(settings.work_latitude), Number(settings.work_longitude), property.latitude, property.longitude,
        )
        return db.from('leila_properties').update({
          work_distance_km: proximity.straightLineKm,
          estimated_road_distance_km: proximity.estimatedRoadKm,
          estimated_commute_minutes: proximity.estimatedMinutes,
          distance_calculated_at: now,
        }).eq('id', property.id)
      }))
      const failed = results.find(result => result.error)
      if (failed?.error) throw failed.error
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
