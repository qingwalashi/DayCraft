import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTenantStore } from '@/lib/store/tenant-store'
import { Tenant } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/utils/env'

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { setCurrentTenant } = useTenantStore()
  const [tenantFetched, setTenantFetched] = useState(false)

  const fetchTenantInfo = useCallback(async (userId: string) => {
    if (typeof window !== 'undefined') {
      const cachedTenant = sessionStorage.getItem(`tenant_info_${userId}`)
      if (cachedTenant) {
        try {
          const tenant = JSON.parse(cachedTenant)
          setCurrentTenant(tenant)
          setTenantFetched(true)
          return
        } catch (e) {
          console.error('解析缓存的租户信息失败:', e)
        }
      }
    }

    const supabase = createClient()
    const { data } = await supabase
      .from('user_profiles')
      .select('tenant_id, tenants:tenant_id(*)')
      .eq('id', userId)
      .single()
    
    if (data && data.tenants) {
      const tenant = data.tenants as unknown as Tenant
      setCurrentTenant(tenant)
      
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`tenant_info_${userId}`, JSON.stringify(tenant))
      }
    }
    
    setTenantFetched(true)
  }, [setCurrentTenant])

  useEffect(() => {
    const supabase = createClient()
    
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user || null)
      
      if (user && !tenantFetched) {
        await fetchTenantInfo(user.id)
      }
      
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null)
        
        if (session?.user && !tenantFetched) {
          await fetchTenantInfo(session.user.id)
        }
        
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchTenantInfo, tenantFetched])

  const login = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      const redirectUrl = getAuthCallbackUrl();
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error('登录失败', {
          description: error.message
        });
        return false
      }
      
      router.push('/dashboard/overview')
      return true
    } catch (error: any) {
      toast.error('登录失败', {
        description: error.message
      });
      return false
    } finally {
      setLoading(false)
    }
  }, [router])

  const signup = useCallback(async (email: string, password: string, tenantName: string) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      const redirectUrl = getAuthCallbackUrl();
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      })

      if (authError) {
        toast.error('注册失败', {
          description: authError.message
        });
        return false
      }

      if (authData.user) {
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .insert([{ name: tenantName }])
          .select()
        
        if (tenantError) {
          toast.error('创建租户失败', {
            description: tenantError.message
          });
          return false
        }
        
        const tenant = tenantData[0] as Tenant;
        await supabase
          .from('user_profiles')
          .insert([{
            id: authData.user.id,
            email: authData.user.email,
            full_name: email.split('@')[0],
            tenant_id: tenant.id,
            role: 'admin'
          }])
        
        setCurrentTenant(tenant)
        
        toast.success('注册成功', {
          description: '请登录您的账户'
        });
        
        router.push('/login')
        return true
      }
      
    } catch (error: any) {
      toast.error('注册失败', {
        description: error.message
      });
      return false
    } finally {
      setLoading(false)
    }
  }, [router, setCurrentTenant])

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setCurrentTenant(null)
    setTenantFetched(false)
    
    if (user && typeof window !== 'undefined') {
      sessionStorage.removeItem(`tenant_info_${user.id}`)
      sessionStorage.removeItem(`user_profile_${user.id}`)
    }
    
    router.push('/')
  }, [router, setCurrentTenant, user])

  return { user, loading, login, signup, logout }
} 