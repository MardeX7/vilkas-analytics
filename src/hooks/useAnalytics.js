import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function useAnalytics() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    dailySales: [],
    weeklySales: [],
    monthlySales: [],
    topProducts: [],
    paymentMethods: [],
    shippingMethods: [],
    customerGeography: [],
    weekdayAnalysis: [],
    hourlyAnalysis: [],
    avgBasket: null
  })

  useEffect(() => {
    fetchAllData()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    setError(null)

    try {
      const [
        dailyRes,
        weeklyRes,
        monthlyRes,
        productsRes,
        paymentRes,
        shippingRes,
        geoRes,
        weekdayRes,
        hourlyRes,
        basketRes
      ] = await Promise.all([
        supabase.from('v_daily_sales').select('*').eq('store_id', STORE_ID).order('sale_date', { ascending: false }).limit(30),
        supabase.from('v_weekly_sales').select('*').eq('store_id', STORE_ID).order('week_start', { ascending: false }).limit(12),
        supabase.from('v_monthly_sales').select('*').eq('store_id', STORE_ID).order('sale_month', { ascending: false }).limit(12),
        supabase.from('v_top_products').select('*').eq('store_id', STORE_ID).limit(10),
        supabase.from('v_payment_methods').select('*').eq('store_id', STORE_ID),
        supabase.from('v_shipping_methods').select('*').eq('store_id', STORE_ID),
        supabase.from('v_customer_geography').select('*').eq('store_id', STORE_ID).limit(10),
        supabase.from('v_weekday_analysis').select('*').eq('store_id', STORE_ID),
        supabase.from('v_hourly_analysis').select('*').eq('store_id', STORE_ID),
        supabase.from('v_avg_basket').select('*').eq('store_id', STORE_ID).single()
      ])

      setData({
        dailySales: dailyRes.data || [],
        weeklySales: weeklyRes.data || [],
        monthlySales: monthlyRes.data || [],
        topProducts: productsRes.data || [],
        paymentMethods: paymentRes.data || [],
        shippingMethods: shippingRes.data || [],
        customerGeography: geoRes.data || [],
        weekdayAnalysis: weekdayRes.data || [],
        hourlyAnalysis: hourlyRes.data || [],
        avgBasket: basketRes.data
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { ...data, loading, error, refresh: fetchAllData }
}

// KPI summary hook
export function useKPISummary() {
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState(null)

  useEffect(() => {
    async function fetch() {
      const { data: monthly } = await supabase
        .from('v_monthly_sales')
        .select('*')
        .eq('store_id', STORE_ID)
        .order('sale_month', { ascending: false })
        .limit(2)

      const { data: daily } = await supabase
        .from('v_daily_sales')
        .select('*')
        .eq('store_id', STORE_ID)
        .order('sale_date', { ascending: false })
        .limit(7)

      const thisMonth = monthly?.[0]
      const lastMonth = monthly?.[1]

      // Viimeisen 7 päivän summat
      const last7Days = daily?.reduce((acc, d) => ({
        revenue: acc.revenue + (d.total_revenue || 0),
        orders: acc.orders + (d.order_count || 0)
      }), { revenue: 0, orders: 0 }) || { revenue: 0, orders: 0 }

      setKpi({
        thisMonth: {
          revenue: thisMonth?.total_revenue || 0,
          orders: thisMonth?.order_count || 0,
          aov: thisMonth?.avg_order_value || 0,
          customers: thisMonth?.unique_customers || 0,
          label: thisMonth?.month_label || '-'
        },
        lastMonth: {
          revenue: lastMonth?.total_revenue || 0,
          orders: lastMonth?.order_count || 0,
          aov: lastMonth?.avg_order_value || 0,
          customers: lastMonth?.unique_customers || 0,
          label: lastMonth?.month_label || '-'
        },
        last7Days,
        currency: thisMonth?.currency || 'SEK'
      })
      setLoading(false)
    }
    fetch()
  }, [])

  return { kpi, loading }
}
