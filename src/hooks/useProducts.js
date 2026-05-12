import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import { normalizeProducts, filterProductsForShopCatalog } from '../utils/helpers'
import { getCached, setCached } from '../utils/cache'

const ITEMS_PER_PAGE = 50

export function useProducts(user) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchProducts = useCallback(async (page = 0, search = '', forceRefresh = false) => {
    try {
      setLoading(true)

      // Check cache
      const cacheKey = `products_${user?.email || 'all'}_${page}_${search}`
      if (!forceRefresh) {
        const cached = getCached(cacheKey)
        if (cached) {
          setProducts(cached.products)
          setHasMore(cached.hasMore)
          setLoading(false)
          return
        }
      }

      let query = supabase
        .from('products')
        .select('*')

      // Note: No need to filter by FranchiseAvailable since we use price-based filtering
      // Franchise users will see all products but with FranchisePrice
      // Regular users will see all products with regular Price

      // Apply search - search in ProductName, Category, Supplier, and ProductID
      if (search && search.trim()) {
        const searchTerm = search.trim()
        // Use or() to search across multiple columns
        query = query.or(`ProductName.ilike.%${searchTerm}%,Category.ilike.%${searchTerm}%,Supplier.ilike.%${searchTerm}%,ProductID.ilike.%${searchTerm}%`)
      }

      // Apply pagination
      const from = page * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1
      // Order by ProductID first, then ProductName as fallback
      query = query.range(from, to).order('ProductID', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching products:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Check if it's RLS issue
        if (error.code === 'PGRST301' || error.message?.includes('RLS') || error.message?.includes('policy')) {
          console.warn('⚠️ RLS policy might be blocking access to products table')
          console.warn('Please disable RLS or create policy for "products" table in Supabase Dashboard')
        }
        setLoading(false)
        return
      }

      // Debug: Log first product to check column names
      if (data && data.length > 0) {
        console.log('Sample product from Supabase:', {
          keys: Object.keys(data[0]),
          unit: data[0]['หน่วย'] || data[0].Unit || data[0].unit,
          raw: data[0]
        })
      }
      
      // Get userType from user object (userType or customerType)
      const userType = user?.userType || user?.customerType || 'regular'
      const normalized = normalizeProducts(data || [], userType)
      const filtered = filterProductsForShopCatalog(normalized, user)

      // Debug: Log normalized product
      if (filtered.length > 0) {
        console.log('Normalized product:', {
          name: filtered[0].name,
          unit: filtered[0].unit,
          weight: filtered[0].weight
        })
      }

      if (page === 0) {
        setProducts(filtered)
      } else {
        setProducts((prev) => [...prev, ...filtered])
      }

      setHasMore(data?.length === ITEMS_PER_PAGE)
      setCurrentPage(page)

      // Cache results
      setCached(cacheKey, { products: filtered, hasMore: data?.length === ITEMS_PER_PAGE })
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchProducts(currentPage + 1, searchTerm)
    }
  }, [loading, hasMore, currentPage, searchTerm, fetchProducts])

  const search = useCallback((term) => {
    setSearchTerm(term)
    setCurrentPage(0)
    fetchProducts(0, term, true)
  }, [fetchProducts])

  useEffect(() => {
    fetchProducts(0, searchTerm)
  }, [user]) // Only fetch on user change

  return {
    products,
    loading,
    hasMore,
    search,
    loadMore,
    refresh: () => fetchProducts(0, searchTerm, true)
  }
}
