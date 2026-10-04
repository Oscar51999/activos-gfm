import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Rol } from './supabase'

export type Perfil = {
  id: string
  nombre: string
  email: string | null
  rol: Rol
  activo: boolean
  todas_empresas: boolean
}

type Ctx = {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  puedeEditar: boolean
  puedeResguardar: boolean
  esAdmin: boolean
  recargarPerfil: () => Promise<void>
  salir: () => Promise<void>
}

const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  async function cargarPerfil(uid: string | undefined) {
    if (!uid) { setPerfil(null); return }
    const { data } = await supabase.from('perfiles')
      .select('id,nombre,email,rol,activo,todas_empresas').eq('id', uid).maybeSingle()
    setPerfil((data as Perfil) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await cargarPerfil(data.session?.user.id)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // diferido para no bloquear el callback de auth
      setTimeout(() => { cargarPerfil(s?.user.id) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const activo = !!perfil?.activo
  const value: Ctx = {
    session, perfil, cargando,
    puedeEditar: activo && (perfil!.rol === 'admin' || perfil!.rol === 'almacen'),
    esAdmin: activo && perfil!.rol === 'admin',
    puedeResguardar: activo && perfil!.rol !== 'consulta',
    recargarPerfil: () => cargarPerfil(session?.user.id),
    salir: async () => { await supabase.auth.signOut(); setPerfil(null); navigator.serviceWorker?.controller?.postMessage('borrar-datos') },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}
