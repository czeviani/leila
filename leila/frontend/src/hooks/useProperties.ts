import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Favorite, PropertyFilters } from '../lib/api'

export const useProperties = (params: Record<string, string | number | undefined> = {}) =>
  useQuery({
    queryKey: ['properties', params],
    queryFn: () => api.properties.list(params),
  })

export const useCities = (search: string) =>
  useQuery({
    queryKey: ['cities', search],
    queryFn: () => api.properties.cities(search),
    enabled: search.trim().length >= 2,
    staleTime: 1000 * 60 * 10,
  })

export const useProperty = (id: string) =>
  useQuery({
    queryKey: ['property', id],
    queryFn: () => api.properties.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as import('../lib/api').Property | undefined
      if (data?.leila_evaluations?.status === 'processing') return 3000
      return false
    },
    refetchIntervalInBackground: true,
  })

export const useFilters = () =>
  useQuery({
    queryKey: ['filters'],
    queryFn: api.filters.get,
  })

export const useSaveFilters = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filters: Partial<PropertyFilters>) => api.filters.save(filters),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['filters'] }),
  })
}

export const useFavorites = () =>
  useQuery({
    queryKey: ['favorites'],
    queryFn: api.favorites.list,
  })

export const useToggleFavorite = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ property_id, isFav }: { property_id: string; isFav: boolean }) =>
      isFav ? api.favorites.remove(property_id) : api.favorites.add(property_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] })
      qc.invalidateQueries({ queryKey: ['properties'] })
    },
  })
}

const OPTIMISTIC_EVALUATION = (property_id: string) => ({
  id: 'optimistic-' + property_id,
  property_id,
  status: 'processing' as const,
  score: null,
  recommendation: null,
  summary: null,
  location_notes: null,
  condition_notes: null,
  documents_notes: null,
  risks: [] as string[],
  highlights: [] as string[],
  price_per_m2: null,
  financial_data: null,
  evaluated_at: null,
})

export const useRequestEvaluation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (property_id: string) => api.evaluations.request(property_id),
    onMutate: async (property_id) => {
      await qc.cancelQueries({ queryKey: ['property', property_id] })
      await qc.cancelQueries({ queryKey: ['favorites'] })

      const previousProperty = qc.getQueryData<import('../lib/api').Property>(['property', property_id])
      const previousFavorites = qc.getQueryData<Favorite[]>(['favorites'])

      qc.setQueryData<import('../lib/api').Property>(['property', property_id], (old) => {
        if (!old) return old
        return { ...old, leila_evaluations: OPTIMISTIC_EVALUATION(property_id) }
      })

      qc.setQueryData<Favorite[]>(['favorites'], (old) => {
        if (!old) return old
        return old.map(fav => {
          if (fav.property_id !== property_id) return fav
          return {
            ...fav,
            leila_properties: fav.leila_properties
              ? { ...fav.leila_properties, leila_evaluations: OPTIMISTIC_EVALUATION(property_id) }
              : undefined,
          }
        })
      })

      return { previousProperty, previousFavorites }
    },
    onError: (_err, property_id, context) => {
      if (context?.previousProperty !== undefined) {
        qc.setQueryData(['property', property_id], context.previousProperty)
      }
      if (context?.previousFavorites !== undefined) {
        qc.setQueryData(['favorites'], context.previousFavorites)
      }
    },
    onSuccess: (_data, property_id) => {
      qc.invalidateQueries({ queryKey: ['property', property_id] })
      qc.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}

/** Avalia múltiplos imóveis em paralelo com update otimista imediato nos cards. */
export const useBulkEvaluate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (propertyIds: string[]) => {
      // Optimistic: marca todos como processing no cache de favorites
      qc.setQueryData<Favorite[]>(['favorites'], (old) => {
        if (!old) return old
        return old.map(fav => {
          if (!propertyIds.includes(fav.property_id)) return fav
          const hasExisting = fav.leila_properties?.leila_evaluations
          if (hasExisting && hasExisting.status !== 'error') return fav
          return {
            ...fav,
            leila_properties: fav.leila_properties
              ? { ...fav.leila_properties, leila_evaluations: OPTIMISTIC_EVALUATION(fav.property_id) }
              : undefined,
          }
        })
      })

      await Promise.allSettled(propertyIds.map(id => api.evaluations.request(id)))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}

export const useSources = () =>
  useQuery({
    queryKey: ['sources'],
    queryFn: api.sources.list,
  })

export const useToggleSource = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.sources.toggle(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  })
}

export const useRunScraper = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (source_id?: string) =>
      source_id ? api.scraper.runSource(source_id) : api.scraper.runAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] })
      qc.invalidateQueries({ queryKey: ['sources'] })
    },
  })
}
