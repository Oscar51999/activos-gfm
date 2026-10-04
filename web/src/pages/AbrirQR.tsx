import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Aviso, Cargando } from '../components/ui'

/** Abre la ficha a partir del identificador QR: /#/q/<uuid> */
export function AbrirQR() {
  const { qr } = useParams()
  const nav = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('activos').select('id').eq('qr', qr!).maybeSingle().then(({ data }) => {
      if (data) nav(`/activos/${data.id}`, { replace: true })
      else setError('No se encontró el activo de esta etiqueta, o no tienes acceso a su empresa.')
    })
  }, [qr, nav])
  return error ? <Aviso>{error}</Aviso> : <Cargando texto="Buscando activo…" />
}

