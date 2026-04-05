import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, PropertyFilters } from '../lib/api'

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
      if (data?.leila_evaluations?.[0]?.status === 'processing') return 3000
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

export const useRequestEvaluation = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (property_id: string) => api.evaluations.request(property_id),
    onMutate: async (property_id) => {
      await qc.cancelQueries({ queryKey: ['property', property_id] })
      const previous = qc.getQueryData<import('../lib/api').Property>(['property', property_id])
      qc.setQueryData<import('../lib/api').Property>(['property', property_id], (old) => {
        if (!old) return old
        return {
          ...old,
          leila_evaluations: [{
            id: 'optimistic',
            property_id,
            status: 'processing' as const,
            score: null,
            recommendation: null,
            summary: null,
            location_notes: null,
            condition_notes: null,
            documents_notes: null,
            risks: [],
            highlights: [],
            price_per_m2: null,
            financial_data: null,
            evaluated_at: null,
          }],
        }
      })
      return { previous }
    },
    onError: (_err, property_id, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(['property', property_id], context.previous)
      }
    },
    onSuccess: (_data, property_id) => {
      qc.invalidateQueries({ queryKey: ['property', property_id] })
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
