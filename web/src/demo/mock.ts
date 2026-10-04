/* Vista previa: simula Supabase dentro del navegador con datos de ejemplo. No se conecta a nada. */
type Row = Record<string, unknown>
type DB = Record<string, Row[]>

const uid = () => crypto.randomUUID()
const hoy = new Date().toISOString().slice(0, 10)
const hace = (d: number) => new Date(Date.now() - d * 864e5).toISOString()

// Ilustraciones genéricas de producto (dibujo propio, sin marcas) para la vista previa.
const PUNTOS_DEMO = ['Llantas y presión', 'Luces y direccionales', 'Frenos', 'Nivel de aceite']
const DIBUJOS: Record<string, string> = {
  laptop: '<rect x="110" y="70" width="180" height="120" rx="8" fill="none" stroke="currentColor" stroke-width="7"/><rect x="126" y="86" width="148" height="88" rx="3" fill="currentColor" opacity=".18"/><path d="M80 205h240l-18 22H98z" fill="currentColor"/>',
  pickup: '<path d="M60 190v-40l30-10 30-40h80l20 40h90l10 10v40z" fill="currentColor" opacity=".9"/><path d="M128 108h62l15 32h-97z" fill="#0b0d11" opacity=".55"/><circle cx="115" cy="195" r="24" fill="#0b0d11" stroke="currentColor" stroke-width="8"/><circle cx="285" cy="195" r="24" fill="#0b0d11" stroke="currentColor" stroke-width="8"/>',
  retro: '<rect x="120" y="120" width="120" height="60" rx="6" fill="currentColor"/><rect x="150" y="80" width="60" height="45" rx="4" fill="currentColor" opacity=".8"/><path d="M240 140l50-40 30 50-20 10-20-30-30 25z" fill="currentColor"/><path d="M120 150l-45 20 5 25 40-15" fill="currentColor" opacity=".85"/><circle cx="145" cy="195" r="22" fill="#0b0d11" stroke="currentColor" stroke-width="8"/><circle cx="220" cy="195" r="22" fill="#0b0d11" stroke="currentColor" stroke-width="8"/>',
  taladro: '<path d="M110 110h140a20 20 0 0 1 0 40H180l-10 70h-40l10-70h-30z" fill="currentColor"/><rect x="250" y="122" width="70" height="16" rx="4" fill="currentColor" opacity=".7"/><rect x="128" y="200" width="44" height="22" rx="4" fill="currentColor" opacity=".6"/>',
  esmeril: '<rect x="90" y="125" width="170" height="40" rx="20" fill="currentColor"/><circle cx="285" cy="145" r="42" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="285" cy="145" r="10" fill="currentColor"/>',
  estacion: '<rect x="160" y="60" width="80" height="70" rx="10" fill="currentColor"/><circle cx="200" cy="95" r="16" fill="#0b0d11"/><path d="M200 130l-60 100M200 130l60 100M200 130v100" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  generador: '<rect x="100" y="95" width="200" height="120" rx="18" fill="currentColor"/><path d="M130 95c0-25 140-25 140 0" fill="none" stroke="currentColor" stroke-width="10"/><rect x="125" y="125" width="70" height="40" rx="6" fill="#0b0d11" opacity=".5"/><circle cx="250" cy="150" r="18" fill="#0b0d11" opacity=".5"/>',
  laser: '<rect x="150" y="90" width="100" height="90" rx="14" fill="currentColor"/><circle cx="200" cy="135" r="20" fill="#0b0d11"/><path d="M40 135h90M270 135h90" stroke="currentColor" stroke-width="4" stroke-dasharray="10 8"/>',
  celular: '<rect x="160" y="50" width="80" height="160" rx="16" fill="none" stroke="currentColor" stroke-width="8"/><rect x="172" y="68" width="56" height="118" rx="4" fill="currentColor" opacity=".2"/><circle cx="200" cy="198" r="5" fill="currentColor"/>',
  impresora: '<rect x="110" y="110" width="180" height="80" rx="10" fill="currentColor"/><rect x="140" y="70" width="120" height="45" fill="currentColor" opacity=".6"/><rect x="140" y="170" width="120" height="50" fill="#e7e5e4"/>',
  chaleco: '<path d="M150 60l-50 30 10 140h70V120l20-30 20 30v110h70l10-140-50-30-20 40h-60z" fill="currentColor"/><rect x="108" y="170" width="184" height="14" fill="#0b0d11" opacity=".35"/><rect x="108" y="140" width="184" height="10" fill="#0b0d11" opacity=".25"/>',
  disco: '<circle cx="200" cy="140" r="90" fill="currentColor"/><circle cx="200" cy="140" r="22" fill="#0b0d11"/><circle cx="200" cy="140" r="60" fill="none" stroke="#0b0d11" stroke-width="3" opacity=".3"/>',
  broca: '<path d="M70 132h120v16H70z" fill="currentColor" opacity=".7"/><path d="M190 128l130 4-10 8 10 8-130 4z" fill="currentColor"/><path d="M215 128l-8 24M245 129l-8 22M275 130l-8 20" stroke="#0b0d11" stroke-width="5" opacity=".4"/>',
  rollo: '<circle cx="200" cy="140" r="80" fill="currentColor"/><circle cx="200" cy="140" r="32" fill="#0b0d11"/><path d="M200 60h140v40H200" fill="currentColor"/><path d="M230 60l-20 40M270 60l-20 40M310 60l-20 40" stroke="#0b0d11" stroke-width="10" opacity=".5"/>',
  guante: '<path d="M140 230V130l-20-40a12 12 0 0 1 22-10l18 30V60a12 12 0 0 1 24 0v60V45a12 12 0 0 1 24 0v75V55a12 12 0 0 1 24 0v70V75a12 12 0 0 1 24 0v95c0 30-20 60-50 60z" fill="currentColor"/>',
  lentes: '<path d="M70 120h260" stroke="currentColor" stroke-width="10"/><rect x="85" y="110" width="105" height="65" rx="28" fill="currentColor" opacity=".55" stroke="currentColor" stroke-width="8"/><rect x="210" y="110" width="105" height="65" rx="28" fill="currentColor" opacity=".55" stroke="currentColor" stroke-width="8"/>',
  bota: '<path d="M130 60h80v100l90 30c20 6 25 20 25 35v10H120z" fill="currentColor"/><rect x="118" y="225" width="210" height="16" rx="4" fill="currentColor" opacity=".7"/>',
  martillo: '<path d="M120 90h120l20 30v40l-20 30H120z" fill="currentColor"/><rect x="170" y="190" width="20" height="60" fill="currentColor" opacity=".8"/><path d="M175 250l5 25 5-25z" fill="currentColor"/><rect x="150" y="60" width="60" height="30" rx="6" fill="currentColor" opacity=".7"/>',
  cucharon: '<path d="M90 110h200l-30 110H130z" fill="currentColor"/><path d="M130 220l-10 20M160 220l-5 22M190 220v22M220 220l5 22M250 220l10 20" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><rect x="170" y="70" width="40" height="40" fill="currentColor" opacity=".7"/>',
  casco: '<path d="M110 180a90 90 0 0 1 180 0z" fill="currentColor"/><rect x="90" y="178" width="220" height="16" rx="8" fill="currentColor"/><path d="M200 95v-10" stroke="currentColor" stroke-width="12"/>',
}
function ilustracion(tipo: keyof typeof DIBUJOS, color: string, fondo = '#1a1d24') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${fondo}" stop-opacity="1"/></radialGradient></defs><rect width="400" height="300" fill="${fondo}"/><rect width="400" height="300" fill="url(#g)"/><g color="${color}" transform="translate(0 15)">${DIBUJOS[tipo]}</g></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function crearDatos() {
  const E = (id: string, nombre: string, corto: string, color: string, logo: string | null, razon: string | null = null) =>
    ({ id, nombre, nombre_corto: corto, razon_social: razon, rfc: null, color, logo_path: logo, logo_oscuro: logo, activo: true })
  const empresas = [
    E('e1', 'Grupo Firme de México', 'Firme México', '#E8352B', 'app:firme-mexico', 'Grupo Firme de México SA de CV'),
    E('e2', 'Construcciones y Terracerías Vanguardia', 'Vanguardia', '#C8D400', 'app:vanguardia', 'Construcciones y Terracerías Vanguardia SA de CV'),
    E('e3', 'Control de Ingeniería y Servicios Añadidos', 'CISA', '#5B9BD5', 'app:cisa'),
    E('e4', 'Comercializadora Mupo', 'MUPO', '#8DC63F', 'app:mupo'),
    E('e5', 'Proyectos y Desarrollos Punta Cortez', 'Punta Cortez', '#FBBA16', 'app:punta-cortez'),
    E('e6', 'Grupo Santa Cruz Desarrollos', 'Santa Cruz', '#C2552B', 'app:santacruz'),
    E('e7', 'Grupo Empresarial Firme', 'Grupo Firme', '#F9B234', 'app:grupo-firme'),
    E('e8', 'Inmobiliaria Atardecer de La Paz', 'Atardecer', '#F28C38', null),
  ]
  const categorias = [
    { id: 'c1', nombre: 'Vehículos', es_vehiculo: true }, { id: 'c2', nombre: 'Maquinaria pesada', es_vehiculo: true },
    { id: 'c3', nombre: 'Herramienta', es_vehiculo: false }, { id: 'c4', nombre: 'Equipo de cómputo', es_vehiculo: false },
    { id: 'c5', nombre: 'Equipo de topografía', es_vehiculo: false }, { id: 'c6', nombre: 'Equipo menor', es_vehiculo: false },
    { id: 'c7', nombre: 'Telefonía', es_vehiculo: false }, { id: 'c8', nombre: 'Seguridad', es_vehiculo: false },
  ].map(c => ({ ...c, activo: true, padre_id: null }))
  const marcas = ['Nissan', 'Toyota', 'Caterpillar', 'John Deere', 'Bosch', 'Makita', 'Lenovo', 'Leica', 'Honda', 'Samsung', 'HP', '3M', 'DeWalt'].map((n, i) => ({ id: 'm' + i, nombre: n, activo: true }))
  const M = (n: string) => marcas.find(m => m.nombre === n)!.id
  const P = (id: string, marca: string, nombre: string, cat: string, desc: string, dib: keyof typeof DIBUJOS, color: string) =>
    ({ id, marca_id: M(marca), nombre, categoria_id: cat, descripcion: desc, foto_path: ilustracion(dib, color), activo: true })
  const modelos = [
    P('mo0', 'Nissan', 'NP300 Doble Cabina', 'c1', 'Camioneta pick-up doble cabina', 'pickup', '#e7e5e4'),
    P('mo1', 'Toyota', 'Hilux 4x4', 'c1', 'Camioneta pick-up 4x4', 'pickup', '#94a3b8'),
    P('mo2', 'Caterpillar', '416F', 'c2', 'Retroexcavadora', 'retro', '#F9B234'),
    P('mo3', 'John Deere', '310L', 'c2', 'Retroexcavadora', 'retro', '#facc15'),
    P('mo4', 'Lenovo', 'ThinkPad E14', 'c4', 'Laptop 14” i5 16 GB', 'laptop', '#cbd5e1'),
    P('mo5', 'Leica', 'TS07', 'c5', 'Estación total', 'estacion', '#fbbf24'),
    P('mo6', 'Honda', 'EU22i', 'c6', 'Generador portátil inverter 2.2 kW', 'generador', '#f87171'),
    P('mo7', 'Bosch', 'GBH 2-28', 'c3', 'Rotomartillo SDS Plus', 'taladro', '#60a5fa'),
    P('mo8', 'Makita', 'GA4530', 'c3', 'Esmeriladora angular 4½”', 'esmeril', '#2dd4bf'),
    P('mo9', 'Bosch', 'GLL 3-80', 'c5', 'Nivel láser de líneas', 'laser', '#4ade80'),
    P('mo10', 'Samsung', 'Galaxy A55', 'c7', 'Celular corporativo', 'celular', '#a5b4fc'),
    P('mo11', 'HP', 'LaserJet M428', 'c4', 'Impresora multifuncional', 'impresora', '#e2e8f0'),
    P('mo12', '3M', 'H-700', 'c8', 'Casco de seguridad', 'casco', '#fde047'),
    P('mo13', 'DeWalt', 'DCD771', 'c3', 'Taladro atornillador inalámbrico', 'taladro', '#facc15'),
    P('mo14', 'Caterpillar', 'H65E', 'c2', 'Martillo hidráulico para retro', 'martillo', '#F9B234'),
    P('mo15', 'John Deere', 'Cucharón 24"', 'c2', 'Cucharón de excavación 24 pulgadas', 'cucharon', '#facc15'),
  ]
  const MOD = (id: string) => modelos.find(m => m.id === id)!
  const D = (id: string, e: string, nombre: string) => ({ id, empresa_id: e, nombre, activo: true })
  const departamentos = [D('d1', 'e1', 'Obra'), D('d2', 'e1', 'Administración'), D('d3', 'e1', 'Topografía'), D('d4', 'e2', 'Maquinaria'), D('d5', 'e2', 'Obra'),
    D('d6', 'e3', 'Topografía'), D('d7', 'e4', 'Ventas'), D('d8', 'e5', 'Obra'), D('d9', 'e7', 'Tecnologías de la información'), D('d10', 'e6', 'Proyectos')]
  const Emp = (id: string, e: string, n: string, a: string, puesto: string, d: string | null = null) => ({ id, empresa_id: e, nombres: n, apellidos: a, puesto, departamento_id: d, codigo: id.replace('em', '10').toUpperCase(), email: `${n.split(' ')[0].toLowerCase()}.${a.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@grupofirme.mx`, telefono: null, activo: true })
  const empleados = [
    Emp('em1', 'e1', 'Janani', 'Aguilar Patrón', 'Residente de obra', 'd1'), Emp('em2', 'e1', 'Luis Adrián', 'Avilés Cota', 'Jefe de obra', 'd1'),
    Emp('em3', 'e1', 'Karmina', 'López', 'Auxiliar administrativo', 'd2'), Emp('em4', 'e1', 'Ramón', 'Zúñiga', 'Topógrafo', 'd3'),
    Emp('em5', 'e2', 'Víctor César', 'Aguilar López', 'Operador de maquinaria', 'd4'), Emp('em6', 'e2', 'Esteffania', 'Ruiz', 'Residente de obra', 'd5'),
    Emp('em7', 'e2', 'José Manuel', 'Higuera', 'Operador de maquinaria', 'd4'), Emp('em8', 'e3', 'Daniela', 'Castro Amador', 'Jefa de topografía', 'd6'),
    Emp('em9', 'e3', 'Héctor', 'Geraldo', 'Cadenero', 'd6'), Emp('em10', 'e4', 'Paola', 'Meza', 'Ejecutiva de ventas', 'd7'),
    Emp('em11', 'e5', 'Arturo', 'Lucero', 'Residente de obra', 'd8'), Emp('em12', 'e5', 'Sofía', 'Green', 'Supervisora de obra', 'd8'),
    Emp('em13', 'e7', 'Oscar', 'Cota Pérez', 'Jefe de TI', 'd9'), Emp('em14', 'e6', 'Ricardo', 'Osuna', 'Gerente de proyectos', 'd10'),
  ]
  const U = (id: string, e: string, nombre: string, tipo: string, codigo: string, resp: string | null = null) => ({ id, empresa_id: e, nombre, tipo, codigo, responsable_id: resp, direccion: 'La Paz, B.C.S.', activo: true, sucursal_id: null, latitud: null, longitud: null })
  const ubicaciones = [
    U('u1', 'e1', 'Almacén central La Paz', 'almacen', 'ALM-01', 'em3'), U('u2', 'e1', 'GF-214 Privado Vista La Paz', 'obra', 'GF-214', 'em1'),
    U('u3', 'e1', 'GF-212 Montaje Mov. Tierra', 'obra', 'GF-212', 'em2'), U('u4', 'e1', 'Oficina corporativa', 'oficina', 'OF-01'),
    U('u5', 'e2', 'Patio de maquinaria El Centenario', 'patio', 'PAT-01'), U('u6', 'e2', 'VG-069 Caseta vigilancia', 'obra', 'VG-069', 'em6'),
    U('u7', 'e3', 'Oficina CISA', 'oficina', 'CI-01', 'em8'), U('u8', 'e4', 'Bodega MUPO', 'almacen', 'MU-01', 'em10'),
    U('u9', 'e5', 'PC-03 Fraccionamiento Punta Cortez', 'obra', 'PC-03', 'em11'), U('u10', 'e7', 'Corporativo Grupo Firme', 'oficina', 'GF-HQ', 'em13'),
    U('u11', 'e6', 'Desarrollo Santa Cruz Etapa 1', 'obra', 'SC-01', 'em14'),
  ]
  const COORD: Record<string, [number, number]> = { u1: [24.1236, -110.3045], u2: [24.158, -110.329], u3: [24.0905, -110.356], u4: [24.143, -110.3115], u5: [24.104, -110.413],
    u6: [24.076, -110.302], u7: [24.135, -110.3], u8: [24.118, -110.29], u9: [24.204, -110.305], u10: [24.1475, -110.306] }
  for (const u of ubicaciones as Row[]) { const c = COORD[u.id as string]; if (c) { u.latitud = c[0]; u.longitud = c[1] } }
  const proveedores = [
    { id: 'p1', nombre: 'Taller Mecánico Baja Diesel', tipos: ['taller'], contacto: 'Ing. Morales', telefono: '612 123 4567', activo: true },
    { id: 'p2', nombre: 'Seguros del Pacífico', tipos: ['aseguradora'], contacto: 'Lic. Navarro', telefono: '612 765 4321', activo: true },
    { id: 'p3', nombre: 'Agencia Nissan La Paz', tipos: ['agencia', 'taller'], contacto: 'Servicio', telefono: '612 555 0101', activo: true },
  ]
  let n = 0
  const A = (o: { mo: string; e: string; s?: string; ne?: string; u?: string; r?: string; est: string; v?: number; dias?: number; f?: string }) => {
    const p = MOD(o.mo)
    return { id: 'a' + (++n), codigo: 'ACT-' + String(n).padStart(6, '0'), qr: uid(), empresa_id: o.e, categoria_id: p.categoria_id, marca_id: p.marca_id, modelo_id: p.id,
      descripcion: p.descripcion, serie: o.s ?? null, numero_economico: o.ne ?? null, ubicacion_id: o.u ?? null, responsable_id: o.r ?? null, estatus: o.est,
      valor_referencia: o.v ?? null, fecha_alta: hace(o.dias ?? 120).slice(0, 10), foto_principal: o.f ?? null, notas: null, updated_at: hace((o.dias ?? 120) / 4), created_at: hace(o.dias ?? 120) }
  }
  const activos = [
    A({ mo: 'mo0', e: 'e1', s: '3N6AD33A5MK812345', ne: 'CT-014', u: 'u2', r: 'em1', est: 'asignado', v: 420000, f: 'f1' }),
    A({ mo: 'mo1', e: 'e1', s: 'MR0EX3DD8N0123456', ne: 'CT-021', u: 'u3', r: 'em2', est: 'asignado', v: 610000, f: 'f2' }),
    A({ mo: 'mo2', e: 'e2', s: 'CAT0416FKHXB01234', ne: 'MQ-003', u: 'u5', est: 'mantenimiento', v: 1850000, f: 'f3' }),
    A({ mo: 'mo3', e: 'e2', s: '1T0310LXKHE123456', ne: 'MQ-005', u: 'u6', r: 'em5', est: 'asignado', v: 1720000 }),
    A({ mo: 'mo5', e: 'e1', s: 'TS07-88812', u: 'u1', est: 'disponible', v: 165000 }),
    A({ mo: 'mo7', e: 'e1', s: 'BH-2231', u: 'u2', r: 'em1', est: 'asignado', v: 6800 }),
    A({ mo: 'mo8', e: 'e1', s: 'MK-GA4530', u: 'u1', est: 'disponible', v: 2400 }),
    A({ mo: 'mo4', e: 'e1', s: 'PF3XYZ12', u: 'u4', r: 'em3', est: 'asignado', v: 21500 }),
    A({ mo: 'mo4', e: 'e1', s: 'PF3XYZ77', u: 'u1', est: 'disponible', v: 21500 }),
    A({ mo: 'mo6', e: 'e1', s: 'EAMJ-1102233', u: 'u1', est: 'disponible', v: 28900 }),
    A({ mo: 'mo9', e: 'e1', s: 'GLL3-80', u: 'u3', r: 'em4', est: 'asignado', v: 9800 }),
    A({ mo: 'mo4', e: 'e1', s: 'PF1OLD99', u: 'u4', est: 'baja', v: 0, dias: 900 }),
    A({ mo: 'mo0', e: 'e2', s: '3N6AD33A1NK554321', ne: 'CT-030', u: 'u6', r: 'em6', est: 'asignado', v: 455000 }),
    A({ mo: 'mo3', e: 'e2', s: '1T0310LXJHE998877', ne: 'MQ-007', u: 'u5', r: 'em7', est: 'asignado', v: 1690000 }),
    A({ mo: 'mo6', e: 'e2', s: 'EAMJ-2200118', u: 'u5', est: 'disponible', v: 28900 }),
    A({ mo: 'mo5', e: 'e3', s: 'TS07-90231', u: 'u7', r: 'em8', est: 'asignado', v: 172000 }),
    A({ mo: 'mo9', e: 'e3', s: 'GLL3-80-B22', u: 'u7', r: 'em9', est: 'asignado', v: 9800 }),
    A({ mo: 'mo4', e: 'e3', s: 'PF4CISA01', u: 'u7', r: 'em8', est: 'asignado', v: 23900 }),
    A({ mo: 'mo10', e: 'e3', s: 'R5CX10AAA', u: 'u7', r: 'em9', est: 'asignado', v: 8900 }),
    A({ mo: 'mo10', e: 'e4', s: 'R5CX10BBB', u: 'u8', r: 'em10', est: 'asignado', v: 8900 }),
    A({ mo: 'mo11', e: 'e4', s: 'PHBQ123456', u: 'u8', est: 'disponible', v: 11200 }),
    A({ mo: 'mo1', e: 'e5', s: 'MR0EX3DD2P0654321', ne: 'PC-002', u: 'u9', r: 'em11', est: 'asignado', v: 640000 }),
    A({ mo: 'mo13', e: 'e5', s: 'DW771-0091', u: 'u9', r: 'em12', est: 'asignado', v: 3900 }),
    A({ mo: 'mo12', e: 'e5', s: 'H700-01', u: 'u9', est: 'disponible', v: 450 }),
    A({ mo: 'mo12', e: 'e5', s: 'H700-02', u: 'u9', est: 'disponible', v: 450 }),
    A({ mo: 'mo4', e: 'e7', s: 'PF4GF-TI01', u: 'u10', r: 'em13', est: 'asignado', v: 25900 }),
    A({ mo: 'mo10', e: 'e7', s: 'R5CX10TI1', u: 'u10', r: 'em13', est: 'asignado', v: 8900 }),
    A({ mo: 'mo11', e: 'e7', s: 'PHBQ998877', u: 'u10', est: 'disponible', v: 11200 }),
    A({ mo: 'mo4', e: 'e6', s: 'PF4SC0001', u: 'u11', r: 'em14', est: 'asignado', v: 23900 }),
    A({ mo: 'mo8', e: 'e2', s: 'MK-GA4530-77', u: 'u5', est: 'siniestrado', v: 2400 }),
    A({ mo: 'mo14', e: 'e2', s: 'H65-22018', u: 'u6', est: 'asignado', r: 'em5', v: 0 }),
    A({ mo: 'mo15', e: 'e2', s: 'JD-B24-0091', u: 'u6', est: 'asignado', r: 'em5', v: 0 }),
    A({ mo: 'mo14', e: 'e2', s: 'H65-23104', u: 'u5', est: 'disponible', v: 0 }),
  ]
  const activo_vehiculo = [
    { activo_id: 'a1', placa: 'CZ-1234-A', anio: 2022, color: 'Blanco', combustible: 'Gasolina', transmision: 'Manual', kilometraje: 48210, cilindros: 4, pasajeros: 5, capacidad_tanque: 80 },
    { activo_id: 'a2', placa: 'CZ-5678-B', anio: 2023, color: 'Gris', combustible: 'Diésel', transmision: 'Manual', kilometraje: 22950, cilindros: 4, pasajeros: 5, capacidad_tanque: 80 },
    { activo_id: 'a3', placa: null, anio: 2019, color: 'Amarillo', combustible: 'Diésel', transmision: null, kilometraje: 6120, cilindros: 4, pasajeros: 1, capacidad_tanque: 160 },
    { activo_id: 'a4', placa: null, anio: 2021, color: 'Amarillo', combustible: 'Diésel', transmision: null, kilometraje: 3380, cilindros: 4, pasajeros: 1, capacidad_tanque: 150 },
  ]
  const urls: Record<string, string> = { f1: ilustracion('pickup', '#f5f5f4', '#2a2622'), f2: ilustracion('pickup', '#cbd5e1', '#1f2430'), f3: ilustracion('retro', '#F9B234', '#2b2112') }
  const activo_fotos = [{ id: uid(), activo_id: 'a1', path: 'f1', created_at: hace(100) }, { id: uid(), activo_id: 'a2', path: 'f2', created_at: hace(90) }, { id: uid(), activo_id: 'a3', path: 'f3', created_at: hace(80) }]
  const movimientos = [
    { id: 'mv1', folio: 'RES-000001', tipo: 'asignacion', empresa_id: 'e1', fecha: hace(30), a_empleado_id: 'em1', a_ubicacion_id: 'u2', entrega_nombre: 'Oscar Cota', recibe_nombre: 'Janani Aguilar Patrón', notas: 'Incluye llanta de refacción, gato y extintor.', firma_recibe: null, firma_entrega: null, documento: null, cancelado: false, created_by: 'u-demo' },
    { id: 'mv2', folio: 'RES-000002', tipo: 'asignacion', empresa_id: 'e1', fecha: hace(12), a_empleado_id: 'em3', a_ubicacion_id: 'u4', entrega_nombre: 'Oscar Cota', recibe_nombre: 'Karmina López', notas: null, firma_recibe: null, firma_entrega: null, documento: null, cancelado: false, created_by: 'u-demo' },
    { id: 'mv3', folio: 'RES-000003', tipo: 'asignacion', empresa_id: 'e3', fecha: hace(6), a_empleado_id: 'em8', a_ubicacion_id: 'u7', entrega_nombre: 'Oscar Cota', recibe_nombre: 'Daniela Castro Amador', notas: 'Estación total con tripié y prisma.', firma_recibe: 'firma-demo', firma_entrega: null, documento: null, cancelado: false, created_by: 'u-demo' },
  ]
  const movimiento_activos = [
    { movimiento_id: 'mv1', activo_id: 'a1', responsable_anterior_id: null, ubicacion_anterior_id: 'u1', estatus_anterior: 'disponible', estado_fisico: 'Buen estado, llantas nuevas' },
    { movimiento_id: 'mv1', activo_id: 'a6', responsable_anterior_id: null, ubicacion_anterior_id: 'u1', estatus_anterior: 'disponible', estado_fisico: null },
    { movimiento_id: 'mv2', activo_id: 'a8', responsable_anterior_id: null, ubicacion_anterior_id: 'u1', estatus_anterior: 'disponible', estado_fisico: 'Con cargador y funda' },
    { movimiento_id: 'mv3', activo_id: 'a16', responsable_anterior_id: null, ubicacion_anterior_id: 'u7', estatus_anterior: 'disponible', estado_fisico: 'Calibrada' },
    { movimiento_id: 'mv3', activo_id: 'a18', responsable_anterior_id: null, ubicacion_anterior_id: 'u7', estatus_anterior: 'disponible', estado_fisico: null },
  ]
  urls['firma-demo'] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><path d="M20 70c30-40 40-50 55-20s20 30 40-10 30-20 45 10 35 0 60-25 40 10 60 5" fill="none" stroke="#1E1719" stroke-width="3" stroke-linecap="round"/></svg>')
  // préstamos temporales
  const dia = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
  const prestar = (mv: string, folio: string, emp: string, ub: string, aid: string, quien: string, hacia: number, dev: number) => {
    const a = activos.find(x => x.id === aid)!; a.estatus = 'asignado'; a.responsable_id = emp
    movimientos.push({ id: mv, folio, tipo: 'asignacion', empresa_id: a.empresa_id, fecha: hace(hacia), a_empleado_id: emp, a_ubicacion_id: ub, entrega_nombre: 'Oscar Cota', recibe_nombre: quien, notas: 'Préstamo temporal', firma_recibe: 'firma-demo', firma_entrega: null, documento: null, cancelado: false, created_by: 'u-demo', fecha_devolucion: dia(dev) } as never)
    movimiento_activos.push(({ movimiento_id: mv, activo_id: aid, responsable_anterior_id: null, ubicacion_anterior_id: a.ubicacion_id, estatus_anterior: 'disponible', estado_fisico: null }) as never)
  }
  prestar('mv4', 'RES-000004', 'em2', 'u3', 'a7', 'Luis Adrián Avilés Cota', 9, -2)
  prestar('mv5', 'RES-000005', 'em4', 'u3', 'a10', 'Ramón Zúñiga', 3, 2)
  prestar('mv6', 'RES-000006', 'em7', 'u5', 'a15', 'José Manuel Higuera', 1, 12)
  ;(movimientos.find(m => m.id === 'mv3') as Row).fecha_devolucion = dia(20)

  const reportes = [
    { id: 'r1', folio: 'FAL-00001', activo_id: 'a3', empresa_id: 'e2', tipo: 'falla', prioridad: 'alta', descripcion: 'Fuga de aceite hidráulico en el brazo trasero; se detuvo la operación.', foto: null, reporta_nombre: 'Víctor César Aguilar', reporta_contacto: '612 140 2233', reportado_por: null, estatus: 'en_proceso', resolucion: null, created_at: hace(4), resuelto_at: null },
    { id: 'r2', folio: 'FAL-00002', activo_id: 'a2', empresa_id: 'e1', tipo: 'dano', prioridad: 'media', descripcion: 'Golpe en la defensa trasera al maniobrar en la obra.', foto: ilustracion('pickup', '#fca5a5', '#2a1717'), reporta_nombre: 'Luis Adrián Avilés', reporta_contacto: null, reportado_por: 'u-3', estatus: 'abierto', resolucion: null, created_at: hace(0.2), resuelto_at: null },
    { id: 'r3', folio: 'FAL-00003', activo_id: 'a10', empresa_id: 'e1', tipo: 'falla', prioridad: 'media', descripcion: 'Arranca pero se apaga a los 2 minutos.', foto: null, reporta_nombre: 'Pedro (velador)', reporta_contacto: '612 000 1122', reportado_por: null, estatus: 'abierto', resolucion: null, created_at: hace(0.05), resuelto_at: null },
    { id: 'r4', folio: 'FAL-00004', activo_id: 'a8', empresa_id: 'e1', tipo: 'falla', prioridad: 'baja', descripcion: 'El cargador no carga la batería.', foto: null, reporta_nombre: 'Karmina López', reporta_contacto: null, reportado_por: null, estatus: 'resuelto', resolucion: 'Se reemplazó el cargador por uno de almacén.', created_at: hace(15), resuelto_at: hace(14) },
  ]
  const inventarios = [
    { id: 'i1', folio: 'INV-0001', empresa_id: 'e1', ubicacion_id: 'u1', nombre: 'Conteo Almacén central · septiembre', estatus: 'cerrado', notas: null, created_by: 'u-demo', created_at: hace(20), cerrado_at: hace(20), resumen: { esperados: 5, encontrados: 4, faltantes: 1, fuera: 1, desconocidos: 0 } },
    { id: 'i2', folio: 'INV-0002', empresa_id: 'e1', ubicacion_id: 'u2', nombre: 'Conteo GF-214 Privado Vista La Paz', estatus: 'abierto', notas: null, created_by: 'u-demo', created_at: hace(0.1), cerrado_at: null, resumen: null },
  ]
  const inventario_lecturas = [{ id: uid(), inventario_id: 'i2', activo_id: 'a1', leido: 'ACT-000001', estado_fisico: null, created_by: 'u-demo', created_at: hace(0.08) }]

  const D2 = (id: string, empresa_id: string, tipo: string, venceEn: number | null, o: Row) => ({ id, empresa_id, activo_id: null, empleado_id: null, tipo, numero: null, emisor: null,
    fecha_emision: venceEn == null ? dia(-200) : dia(venceEn - 365), fecha_vencimiento: venceEn == null ? null : dia(venceEn), avisar_dias: 30, archivo_path: 'doc-demo', archivo_nombre: 'documento.pdf',
    notas: null, vigente: true, renovado_de: null, created_by: 'u-demo', created_at: hace(30), updated_at: hace(30), ...o })
  const documentos = [
    D2('doc1', 'e1', 'poliza_seguro', 12, { activo_id: 'a1', numero: 'GNP-778812', emisor: 'GNP Seguros', notas: 'Cobertura amplia · siniestros 800 400 9000' }),
    D2('doc2', 'e1', 'tarjeta_circulacion', 200, { activo_id: 'a1', numero: 'CZ-1234-A', emisor: 'Gobierno de B.C.S.' }),
    D2('doc3', 'e1', 'verificacion', -5, { activo_id: 'a2', numero: 'VER-2291', emisor: 'Centro de verificación La Paz', avisar_dias: 15 }),
    D2('doc4', 'e1', 'poliza_seguro', 150, { activo_id: 'a2', numero: 'QUA-55120', emisor: 'Qualitas' }),
    D2('doc5', 'e1', 'calibracion', 25, { activo_id: 'a5', numero: 'CAL-07-118', emisor: 'Laboratorio Topográfico del Noroeste', avisar_dias: 45 }),
    D2('doc6', 'e3', 'calibracion', -3, { activo_id: 'a16', numero: 'CAL-07-201', emisor: 'Laboratorio Topográfico del Noroeste' }),
    D2('doc7', 'e2', 'poliza_seguro', 90, { activo_id: 'a3', numero: 'MAP-9001', emisor: 'Mapfre' }),
    D2('doc8', 'e1', 'licencia_manejo', 40, { empleado_id: 'em1', numero: 'BCS-0045821', emisor: 'Tipo B · B.C.S.' }),
    D2('doc9', 'e2', 'licencia_manejo', 6, { empleado_id: 'em7', numero: 'BCS-0099120', emisor: 'Tipo E · B.C.S.' }),
    D2('doc10', 'e1', 'garantia', 300, { activo_id: 'a8', numero: 'LEN-WTY-3Y', emisor: 'Lenovo' }),
    D2('doc11', 'e1', 'factura', null, { activo_id: 'a8', numero: 'A-10422', emisor: 'Distribuidora de cómputo' }),
    D2('doc12', 'e5', 'tarjeta_circulacion', 18, { activo_id: 'a22', numero: 'CZ-9911-C', emisor: 'Gobierno de B.C.S.' }),
  ]
  urls['doc-demo'] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><rect width="600" height="800" fill="#fff"/><rect x="50" y="50" width="200" height="30" fill="#F9B234"/><g fill="#d6d3d1">' + Array.from({ length: 14 }, (_, i) => `<rect x="50" y="${130 + i * 40}" width="${300 + (i * 37) % 200}" height="14"/>`).join('') + '</g><text x="50" y="760" font-family="Arial" font-size="18" fill="#78716c">Documento de ejemplo</text></svg>')

  const kits = [
    { id: 'k1', nombre: 'Kit residente de obra', puesto: 'Residente de obra', descripcion: 'Lo básico para dirigir una obra', activo: true, created_at: hace(40) },
    { id: 'k2', nombre: 'Kit topógrafo', puesto: 'Topógrafo', descripcion: 'Equipo de medición y seguridad', activo: true, created_at: hace(40) },
  ]
  const kit_items = [
    { id: uid(), kit_id: 'k1', modelo_id: 'mo4', cantidad: 1 }, { id: uid(), kit_id: 'k1', modelo_id: 'mo10', cantidad: 1 }, { id: uid(), kit_id: 'k1', modelo_id: 'mo12', cantidad: 1 },
    { id: uid(), kit_id: 'k2', modelo_id: 'mo5', cantidad: 1 }, { id: uid(), kit_id: 'k2', modelo_id: 'mo9', cantidad: 1 }, { id: uid(), kit_id: 'k2', modelo_id: 'mo12', cantidad: 1 },
  ]
  const snap = (emp: string) => activos.filter(a => a.responsable_id === emp).map(a => { const mo = modelos.find(m => m.id === a.modelo_id); return { id: a.id, codigo: a.codigo, descripcion: a.descripcion, marca: marcas.find(m => m.id === a.marca_id)?.nombre ?? null, modelo: mo?.nombre ?? null, serie: a.serie, foto: mo?.foto_path ?? null } })
  const confirmaciones = [
    { id: 'cf1', token: uid(), empresa_id: 'e1', empleado_id: 'em4', activos: snap('em4'), estatus: 'pendiente', comentario: null, faltantes: null, firma: null, respondido_at: null, created_by: 'u-demo', created_at: hace(2) },
    { id: 'cf2', token: uid(), empresa_id: 'e1', empleado_id: 'em1', activos: snap('em1'), estatus: 'con_diferencias', comentario: 'El rotomartillo se quedó en la caseta de la obra.', faltantes: ['ACT-000006'], firma: null, respondido_at: hace(1), created_by: 'u-demo', created_at: hace(2) },
    { id: 'cf3', token: uid(), empresa_id: 'e3', empleado_id: 'em8', activos: snap('em8'), estatus: 'confirmado', comentario: null, faltantes: null, firma: null, respondido_at: hace(1.5), created_by: 'u-demo', created_at: hace(2) },
  ]
  const traspasos_empresa = [
    { id: 't1', folio: 'TRE-00001', de_empresa_id: 'e1', a_empresa_id: 'e5', a_ubicacion_id: 'u9', activos: ['a9'], motivo: 'Se necesita una laptop para la residencia de Punta Cortez', estatus: 'pendiente', respuesta: null, solicitado_por: 'u-demo', resuelto_por: null, resuelto_at: null, created_at: hace(1) },
  ]
  ;(movimientos.find(m => m.id === 'mv2') as Row).token_firma = 'firma-demo-token'

  const T = (xs: string) => xs.split('|')
  const planes_mantenimiento = [
    { id: 'pm1', nombre: 'Servicio de 10,000 km', modelo_id: 'mo0', activo_id: null, disparo: 'km', intervalo: 10000, avisar_antes: 1000, tareas: T('Cambio de aceite y filtro|Filtro de aire|Rotación de llantas|Revisión de frenos|Niveles generales'), activo: true, created_at: hace(300) },
    { id: 'pm2', nombre: 'Servicio de 10,000 km', modelo_id: 'mo1', activo_id: null, disparo: 'km', intervalo: 10000, avisar_antes: 1000, tareas: T('Cambio de aceite y filtro|Filtro de diésel|Filtro de aire|Revisión de suspensión'), activo: true, created_at: hace(300) },
    { id: 'pm3', nombre: 'Servicio de 250 horas', modelo_id: 'mo3', activo_id: null, disparo: 'horas', intervalo: 250, avisar_antes: 25, tareas: T('Aceite de motor y filtro|Engrasado general|Filtro de combustible|Revisión de mangueras hidráulicas'), activo: true, created_at: hace(300) },
    { id: 'pm4', nombre: 'Servicio de 500 horas', modelo_id: 'mo2', activo_id: null, disparo: 'horas', intervalo: 500, avisar_antes: 50, tareas: T('Aceite de motor y filtro|Aceite hidráulico|Filtros de aire primario y secundario|Engrasado general|Revisión de transmisión'), activo: true, created_at: hace(300) },
    { id: 'pm5', nombre: 'Revisión trimestral', modelo_id: 'mo6', activo_id: null, disparo: 'dias', intervalo: 90, avisar_antes: 15, tareas: T('Cambio de aceite|Bujía|Limpieza de filtro de aire|Prueba con carga'), activo: true, created_at: hace(300) },
  ]
  const LE = (a: string, tipo: string, valor: number, d: number, origen = 'manual') => ({ id: uid(), activo_id: a, empresa_id: activos.find(x => x.id === a)!.empresa_id, tipo, valor, fecha: hace(d), origen, registrado_por: 'u-demo', nota: null })
  const lecturas = [
    LE('a1', 'km', 40000, 60, 'orden'), LE('a1', 'km', 44100, 35), LE('a1', 'km', 47200, 12), LE('a1', 'km', 49350, 1, 'checklist'),
    LE('a2', 'km', 10000, 200, 'orden'), LE('a2', 'km', 18500, 60), LE('a2', 'km', 22950, 3),
    LE('a13', 'km', 30000, 40, 'orden'), LE('a13', 'km', 31500, 4),
    LE('a4', 'horas', 3200, 50, 'orden'), LE('a4', 'horas', 3430, 2, 'checklist'),
    LE('a14', 'horas', 1800, 90, 'orden'), LE('a14', 'horas', 2100, 5),
    LE('a3', 'horas', 5700, 120, 'orden'), LE('a3', 'horas', 6120, 6),
  ]
  const OTx = (id: string, folio: string, a: string, o: Row) => ({ id, folio, activo_id: a, empresa_id: activos.find(x => x.id === a)!.empresa_id, tipo: 'preventivo', plan_id: null, reporte_id: null, titulo: '', descripcion: null, prioridad: 'media', estatus: 'terminada',
    proveedor_id: null, responsable: null, fecha_programada: null, fecha_inicio: null, fecha_fin: null, lectura: null, checklist: [], fotos_antes: [], fotos_despues: [], refacciones: null, notas_cierre: null, created_by: 'u-demo', created_at: hace(10), updated_at: hace(10), ...o })
  const lista = (p: string, hechos = 99) => planes_mantenimiento.find(x => x.id === p)!.tareas.map((t, i) => ({ tarea: t, hecho: i < hechos }))
  const ordenes_trabajo = [
    OTx('ot1', 'OT-00001', 'a3', { plan_id: 'pm4', titulo: 'Servicio de 500 horas', estatus: 'en_proceso', proveedor_id: 'p1', responsable: 'Ing. Morales', fecha_programada: dia(-2), fecha_inicio: hace(2), checklist: lista('pm4', 2), created_at: hace(3), fotos_antes: [ilustracion('retro', '#F9B234', '#2b2112')] }),
    OTx('ot2', 'OT-00002', 'a3', { tipo: 'correctivo', reporte_id: 'r1', titulo: 'Fuga de aceite hidráulico en brazo trasero', prioridad: 'alta', estatus: 'espera_refaccion', proveedor_id: 'p1', responsable: 'Ing. Morales', fecha_programada: dia(-1), fecha_inicio: hace(2), checklist: [{ tarea: 'Diagnóstico de la fuga', hecho: true }, { tarea: 'Cambio de sello del cilindro', hecho: false }, { tarea: 'Prueba de presión', hecho: false }], refacciones: null, created_at: hace(3) }),
    OTx('ot3', 'OT-00003', 'a1', { plan_id: 'pm1', titulo: 'Servicio de 10,000 km', fecha_fin: hace(60), fecha_inicio: hace(60), lectura: 40000, checklist: lista('pm1'), proveedor_id: 'p3', refacciones: 'Aceite 5W30, filtro de aceite y aire', created_at: hace(61) }),
    OTx('ot4', 'OT-00004', 'a2', { plan_id: 'pm2', titulo: 'Servicio de 10,000 km', fecha_fin: hace(200), fecha_inicio: hace(200), lectura: 10000, checklist: lista('pm2'), created_at: hace(201) }),
    OTx('ot5', 'OT-00005', 'a4', { plan_id: 'pm3', titulo: 'Servicio de 250 horas', fecha_fin: hace(50), lectura: 3200, checklist: lista('pm3'), created_at: hace(51) }),
    OTx('ot6', 'OT-00006', 'a14', { plan_id: 'pm3', titulo: 'Servicio de 250 horas', fecha_fin: hace(90), lectura: 1800, checklist: lista('pm3'), created_at: hace(91) }),
    OTx('ot7', 'OT-00007', 'a13', { plan_id: 'pm1', titulo: 'Servicio de 10,000 km', fecha_fin: hace(40), lectura: 30000, checklist: lista('pm1'), created_at: hace(41) }),
    OTx('ot9', 'OT-00008', 'a3', { plan_id: 'pm4', titulo: 'Servicio de 500 horas', fecha_fin: hace(120), lectura: 5700, checklist: lista('pm4'), proveedor_id: 'p1', created_at: hace(121) }),
    OTx('ot8', 'OT-00009', 'a10', { tipo: 'correctivo', titulo: 'Se apaga a los 2 minutos', estatus: 'abierta', responsable: 'Taller interno', fecha_programada: dia(1), checklist: [{ tarea: 'Revisar carburador', hecho: false }, { tarea: 'Revisar bujía', hecho: false }], created_at: hace(0.04) }),
  ]
  ;(reportes.find(r => r.id === 'r1') as Row).estatus = 'en_proceso'
  const checklists = [
    { id: uid(), activo_id: 'a1', empresa_id: 'e1', operador: 'Janani Aguilar', lectura: 49350, respuestas: PUNTOS_DEMO.map(p => ({ punto: p, ok: true, nota: '' })), todo_ok: true, foto: null, reporte_id: null, registrado_por: null, created_at: hace(1) },
    { id: uid(), activo_id: 'a4', empresa_id: 'e2', operador: 'Víctor César Aguilar', lectura: 3430, respuestas: [{ punto: 'Fugas de aceite o hidráulico', ok: true, nota: '' }, { punto: 'Luces y alarma de reversa', ok: false, nota: 'Alarma de reversa no suena' }], todo_ok: false, foto: null, reporte_id: null, registrado_por: null, created_at: hace(2) },
  ]

  const CS = (id: string, nombre: string, categoria: string, unidad: string, marca: string | null, minimo: number, dib: keyof typeof DIBUJOS, color: string) => ({ id, nombre, categoria, unidad, marca, minimo, foto: ilustracion(dib, color), activo: true, created_at: hace(90) })
  const consumibles = [
    CS('cs1', 'Casco de seguridad blanco', 'EPP', 'pieza', '3M', 10, 'casco', '#f5f5f4'), CS('cs2', 'Chaleco reflejante', 'EPP', 'pieza', null, 15, 'chaleco', '#fb923c'),
    CS('cs3', 'Guantes de carnaza', 'EPP', 'par', null, 30, 'guante', '#d6a36b'), CS('cs4', 'Lentes de seguridad claros', 'EPP', 'pieza', '3M', 20, 'lentes', '#7dd3fc'),
    CS('cs5', 'Disco de corte 4½”', 'Consumible de obra', 'pieza', 'Makita', 25, 'disco', '#94a3b8'), CS('cs6', 'Broca SDS Plus ½”', 'Herramienta menor', 'pieza', 'Bosch', 5, 'broca', '#60a5fa'),
    CS('cs7', 'Cinta de precaución', 'Consumible de obra', 'rollo', null, 6, 'rollo', '#facc15'), CS('cs8', 'Botas de seguridad', 'EPP', 'par', null, 4, 'bota', '#a16207'),
  ]
  const MC = (c: string, e: string, u: string | null, tipo: string, cantidad: number, d: number, o: Row = {}) => ({ id: uid(), consumible_id: c, empresa_id: e, ubicacion_id: u, tipo, cantidad, empleado_id: null, solicitud_id: null, notas: null, created_by: 'u-demo', created_at: hace(d), ...o })
  const movimientos_consumible = [
    MC('cs1', 'e1', 'u1', 'entrada', 40, 60, { notas: 'Remisión 4521' }), MC('cs2', 'e1', 'u1', 'entrada', 50, 60, { notas: 'Remisión 4521' }), MC('cs3', 'e1', 'u1', 'entrada', 120, 45),
    MC('cs4', 'e1', 'u1', 'entrada', 30, 45), MC('cs5', 'e1', 'u1', 'entrada', 100, 30), MC('cs6', 'e1', 'u1', 'entrada', 12, 30), MC('cs7', 'e1', 'u1', 'entrada', 20, 30), MC('cs8', 'e1', 'u1', 'entrada', 10, 50),
    MC('cs1', 'e1', 'u1', 'salida', 12, 20, { notas: 'Traspaso a GF-214 Privado Vista La Paz' }), MC('cs1', 'e1', 'u2', 'entrada', 12, 20, { notas: 'Traspaso desde Almacén central La Paz' }),
    MC('cs4', 'e1', 'u1', 'salida', 14, 12, { notas: 'Cuadrilla de topografía' }), MC('cs5', 'e1', 'u1', 'salida', 40, 8),
    MC('cs1', 'e1', 'u1', 'salida', 1, 30, { empleado_id: 'em1' }), MC('cs2', 'e1', 'u1', 'salida', 1, 30, { empleado_id: 'em1' }), MC('cs8', 'e1', 'u1', 'salida', 1, 30, { empleado_id: 'em1' }),
    MC('cs3', 'e1', 'u1', 'salida', 2, 5, { empleado_id: 'em1' }), MC('cs1', 'e1', 'u1', 'salida', 1, 9, { empleado_id: 'em4' }), MC('cs4', 'e1', 'u1', 'salida', 1, 9, { empleado_id: 'em4' }),
    MC('cs1', 'e2', 'u5', 'entrada', 15, 40), MC('cs2', 'e2', 'u5', 'entrada', 20, 40), MC('cs3', 'e2', 'u5', 'entrada', 60, 40), MC('cs7', 'e2', 'u5', 'entrada', 8, 40), MC('cs7', 'e2', 'u5', 'salida', 5, 10, { notas: 'VG-069 delimitación de zanja' }),
    MC('cs1', 'e2', 'u5', 'salida', 1, 15, { empleado_id: 'em5' }), MC('cs8', 'e2', 'u5', 'entrada', 6, 40), MC('cs8', 'e2', 'u5', 'salida', 1, 15, { empleado_id: 'em5' }),
    MC('cs1', 'e5', 'u9', 'entrada', 12, 25), MC('cs3', 'e5', 'u9', 'entrada', 40, 25), MC('cs2', 'e5', 'u9', 'entrada', 18, 25), MC('cs3', 'e5', 'u9', 'ajuste', -2, 3, { notas: 'Conteo: 38 (antes 40)' }),
  ]
  const S = (id: string, folio: string, e: string, emp: string | null, u: string | null, items: Row[], estatus: string, d: number, o: Row = {}) => ({ id, folio, empresa_id: e, empleado_id: emp, ubicacion_id: u, items, motivo: null, fecha_necesaria: null, estatus,
    respuesta: null, resuelto_por: null, resuelto_at: null, movimiento_id: null, entregado_at: null, solicitante: 'Luis Adrián Avilés', created_by: 'u-3', created_at: hace(d), ...o })
  const solicitudes = [
    S('s1', 'SOL-00001', 'e3', 'em9', 'u7', [{ tipo: 'consumible', consumible_id: 'cs4', cantidad: 2 }], 'entregada', 20, { solicitante: 'Daniela Castro Amador', created_by: 'u-demo', entregado_at: hace(19), resuelto_at: hace(19) }),
    S('s2', 'SOL-00002', 'e2', 'em7', 'u5', [{ tipo: 'libre', descripcion: 'Cortadora de concreto 14”', cantidad: 1 }], 'rechazada', 9, { solicitante: 'Esteffania Ruiz', created_by: 'u-demo', respuesta: 'Se renta por obra; pídelo a compras con la residencia.', resuelto_at: hace(8) }),
    S('s3', 'SOL-00003', 'e5', 'em12', 'u9', [{ tipo: 'producto', modelo_id: 'mo12', cantidad: 2 }, { tipo: 'consumible', consumible_id: 'cs3', cantidad: 5 }, { tipo: 'libre', descripcion: 'Escalera de tijera 8 peldaños', cantidad: 1 }], 'aprobada', 2,
      { solicitante: 'Arturo Lucero', created_by: 'u-demo', motivo: 'Entra cuadrilla nueva de albañilería', fecha_necesaria: dia(1), respuesta: 'Pasa mañana temprano al almacén de la obra.', resuelto_at: hace(1) }),
    S('s4', 'SOL-00004', 'e1', 'em2', 'u3', [{ tipo: 'producto', modelo_id: 'mo5', cantidad: 1 }, { tipo: 'consumible', consumible_id: 'cs5', cantidad: 10 }], 'pendiente', 0.3, { motivo: 'Trazo de plataformas en GF-212 la próxima semana', fecha_necesaria: dia(3) }),
    S('s5', 'SOL-00005', 'e1', null, 'u2', [{ tipo: 'producto', modelo_id: 'mo4', cantidad: 1 }, { tipo: 'consumible', consumible_id: 'cs2', cantidad: 6 }], 'pendiente', 0.1, { solicitante: 'Janani Aguilar Patrón', motivo: 'Laptop para el auxiliar de residencia y chalecos para visitas', fecha_necesaria: dia(0) }),
  ]

  const IN = (id: string, codigo: string, e: string, nombre: string, tipo: string, o: Row = {}) => ({ id, codigo, empresa_id: e, nombre, propietario: null, clave_catastral: null, superficie_terreno: null, superficie_construccion: null,
    calle: null, numero_ext: null, numero_int: null, manzana: null, lote: null, colonia: null, entre_calles: null, municipio: 'La Paz', estado: 'Baja California Sur', cp: null, tipo, clasificacion: 'urbana', situacion: null,
    servicios: [], colindancias: null, observaciones: null, foto: null, latitud: null, longitud: null, ubicacion_id: null, activo: true, created_at: hace(200), updated_at: hace(20), ...o })
  const foto = (cielo: string, cuerpo: string, techo: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cielo}"/><stop offset="1" stop-color="#0b0d11"/></linearGradient></defs><rect width="400" height="220" fill="url(#c)"/><rect y="170" width="400" height="50" fill="#1c1a17"/><rect x="70" y="80" width="260" height="95" fill="${cuerpo}"/><path d="M60 82l140-45 140 45z" fill="${techo}"/>${Array.from({ length: 5 }, (_, i) => `<rect x="${92 + i * 46}" y="105" width="26" height="30" fill="#0b0d11" opacity=".55"/>`).join('')}<rect x="180" y="140" width="40" height="35" fill="#0b0d11" opacity=".7"/></svg>`)
  const inmuebles = [
    IN('in1', 'INM-0001', 'e7', 'Corporativo Grupo Firme', 'oficina', { propietario: 'Grupo Empresarial Firme SA de CV', clave_catastral: '101-001-045-012', superficie_terreno: 850, superficie_construccion: 1240, calle: 'Blvd. Forjadores', numero_ext: '1520', colonia: 'Fovissste', cp: '23080', situacion: 'oficina', servicios: ['agua', 'luz', 'drenaje', 'internet', 'pavimento'], latitud: 24.1475, longitud: -110.306, ubicacion_id: 'u10', foto: foto('#1e3a5f', '#d6d3d1', '#78716c') }),
    IN('in2', 'INM-0002', 'e2', 'Patio de maquinaria El Centenario', 'patio', { propietario: 'Construcciones y Terracerías Vanguardia SA de CV', clave_catastral: '104-020-118-001', superficie_terreno: 12500, superficie_construccion: 320, calle: 'Carretera Transpeninsular', numero_ext: 'km 12', colonia: 'El Centenario', clasificacion: 'suburbana', situacion: 'empresa_socios', servicios: ['agua', 'luz'], latitud: 24.104, longitud: -110.413, ubicacion_id: 'u5', colindancias: 'Norte: 125 m con carretera\nSur: 125 m con parcela 44\nOriente: 100 m con camino vecinal\nPoniente: 100 m con parcela 46', foto: foto('#5b3a1a', '#a8a29e', '#57534e') }),
    IN('in3', 'INM-0003', 'e1', 'Bodega Almacén central', 'bodega', { propietario: 'Grupo Firme de México SA de CV', superficie_terreno: 1200, superficie_construccion: 900, calle: 'Calle Ignacio Ramírez', numero_ext: '340', colonia: 'Centro', situacion: 'empresa_socios', servicios: ['agua', 'luz', 'drenaje', 'internet'], latitud: 24.1236, longitud: -110.3045, ubicacion_id: 'u1', foto: foto('#3f2a14', '#e7e5e4', '#a8a29e') }),
    IN('in4', 'INM-0004', 'e5', 'Terreno Punta Cortez lote 18', 'terreno', { propietario: 'Proyectos y Desarrollos Punta Cortez SA de CV', clave_catastral: '108-055-018-000', superficie_terreno: 4800, manzana: '7', lote: '18', colonia: 'Fracc. Punta Cortez', situacion: 'reserva', clasificacion: 'suburbana', latitud: 24.21, longitud: -110.31 }),
    IN('in5', 'INM-0005', 'e1', 'Casa para personal · Col. Pueblo Nuevo', 'casa_personal', { superficie_terreno: 160, superficie_construccion: 110, calle: 'Calle Rosales', numero_ext: '88', colonia: 'Pueblo Nuevo', situacion: 'campamento', servicios: ['agua', 'luz', 'drenaje', 'gas'] }),
  ]
  const DI = (id: string, i: string, e: string, tipo: string, venceEn: number | null, o: Row = {}) => ({ ...D2(id, e, tipo, venceEn, {}), inmueble_id: i, subtipo: null, ...o })
  ;(documentos as Row[]).push(
    DI('di1', 'in1', 'e7', 'escritura', null, { numero: '22,971', emisor: 'Notaría 11 La Paz' }), DI('di2', 'in1', 'e7', 'registro_publico', null, { numero: 'Folio real 45812' }),
    DI('di3', 'in1', 'e7', 'predial', 88, { numero: '101-001-045-012', emisor: 'Ayuntamiento de La Paz' }), DI('di4', 'in1', 'e7', 'uso_suelo', 140, { emisor: 'Desarrollo Urbano La Paz' }),
    DI('di5', 'in1', 'e7', 'pc_dictamen', 20, { emisor: 'Protección Civil Municipal' }), DI('di6', 'in1', 'e7', 'poliza_seguro', 210, { numero: 'GNP-INM-9921', emisor: 'GNP Seguros', subtipo: 'Daños al inmueble' }),
    DI('di7', 'in1', 'e7', 'fumigacion', -4, { emisor: 'Control de Plagas del Pacífico' }), DI('di8', 'in1', 'e7', 'plano', null, { subtipo: 'Arquitectónico' }),
    DI('di9', 'in2', 'e2', 'escritura', null, { numero: '8,114', emisor: 'Notaría 3 La Paz' }), DI('di10', 'in2', 'e2', 'predial', -12, { emisor: 'Ayuntamiento de La Paz' }),
    DI('di11', 'in2', 'e2', 'uso_suelo', 60, { emisor: 'Desarrollo Urbano La Paz' }), DI('di12', 'in3', 'e1', 'escritura', null, {}), DI('di13', 'in3', 'e1', 'registro_publico', null, {}),
    DI('di14', 'in3', 'e1', 'predial', 88, {}), DI('di15', 'in3', 'e1', 'pc_dictamen', 9, { emisor: 'Protección Civil Municipal' }), DI('di16', 'in3', 'e1', 'pipc', 160, {}),
    DI('di17', 'in4', 'e5', 'escritura', null, {}), DI('di18', 'in4', 'e5', 'predial', 88, {}), DI('di19', 'in4', 'e5', 'constancias', 40, { subtipo: 'Libertad de gravámenes' }),
  )

  ;(activos.find(a => a.id === 'a31') as Row).montado_en = 'a4'; (activos.find(a => a.id === 'a32') as Row).montado_en = 'a4'
  const montajes = [
    { id: uid(), componente_id: 'a31', equipo_id: 'a4', empresa_id: 'e2', montado_at: hace(25), desmontado_at: null, lectura: 3300, notas: 'Para demolición en VG-069', created_by: 'u-demo' },
    { id: uid(), componente_id: 'a32', equipo_id: 'a4', empresa_id: 'e2', montado_at: hace(120), desmontado_at: null, lectura: null, notas: null, created_by: 'u-demo' },
    { id: uid(), componente_id: 'a33', equipo_id: 'a4', empresa_id: 'e2', montado_at: hace(90), desmontado_at: hace(26), lectura: null, notas: 'Se cambió por el H65E de menor desgaste', created_by: 'u-demo' },
  ]
  const CF = (grupo: string, codigo: string, nombre: string) => ({ id: 'cf-' + codigo, grupo, codigo, nombre, activo: true, created_at: hace(60) })
  const codigos_falla = [
    CF('dano', 'D01', 'Fuga de aceite o hidráulico'), CF('dano', 'D02', 'Falla eléctrica'), CF('dano', 'D03', 'No arranca'), CF('dano', 'D04', 'Sobrecalentamiento'), CF('dano', 'D05', 'Llanta o tren de rodaje'),
    CF('dano', 'D06', 'Golpe o daño estructural'), CF('dano', 'D07', 'Desgaste de pieza'), CF('dano', 'D08', 'Pantalla o equipo de cómputo'), CF('dano', 'D09', 'Calibración fuera de rango'), CF('dano', 'D10', 'Ruido o vibración anormal'),
    CF('causa', 'C01', 'Desgaste normal por uso'), CF('causa', 'C02', 'Falta de mantenimiento'), CF('causa', 'C03', 'Mala operación'), CF('causa', 'C04', 'Defecto de fábrica'), CF('causa', 'C05', 'Accidente o golpe'),
    CF('causa', 'C06', 'Condiciones de obra (polvo, agua, calor)'), CF('causa', 'C07', 'Pieza de mala calidad'), CF('causa', 'C08', 'Causa desconocida'),
    CF('accion', 'A01', 'Reemplazo de pieza'), CF('accion', 'A02', 'Reparación en sitio'), CF('accion', 'A03', 'Ajuste o calibración'), CF('accion', 'A04', 'Limpieza y lubricación'), CF('accion', 'A05', 'Envío a taller externo'), CF('accion', 'A06', 'Garantía con proveedor'), CF('accion', 'A07', 'Capacitación al operador'),
  ]
  // historial de correctivos para que Confiabilidad tenga qué mostrar
  const corr = (id: string, a: string, dias: number, durH: number, dano: string, causa: string, accion: string, titulo: string) => ({ ...OTx(id, 'OT-H' + id.slice(-3), a, { tipo: 'correctivo', titulo, fecha_inicio: hace(dias), fecha_fin: new Date(Date.now() - dias * 864e5 + durH * 3.6e6).toISOString(), created_at: hace(dias + 0.2) }), dano_id: 'cf-' + dano, causa_id: 'cf-' + causa, accion_id: 'cf-' + accion, paro: true })
  ;(ordenes_trabajo as Row[]).push(
    corr('h01', 'a3', 70, 52, 'D01', 'C02', 'A01', 'Fuga en cilindro de pluma'), corr('h02', 'a3', 41, 30, 'D04', 'C06', 'A04', 'Se calienta en jornada larga'), corr('h03', 'a3', 18, 20, 'D01', 'C01', 'A01', 'Manguera hidráulica rota'),
    corr('h04', 'a4', 55, 8, 'D05', 'C03', 'A02', 'Llanta ponchada'), corr('h05', 'a14', 33, 26, 'D02', 'C04', 'A06', 'Alternador sin carga'), corr('h06', 'a2', 62, 6, 'D06', 'C05', 'A02', 'Golpe en defensa'),
    corr('h07', 'a1', 28, 4, 'D03', 'C01', 'A01', 'Batería descargada'), corr('h08', 'a13', 12, 10, 'D10', 'C02', 'A04', 'Ruido en suspensión'), corr('h09', 'a3', 8, 14, 'D07', 'C01', 'A01', 'Dientes de cucharón gastados'),
  )
  for (const o of ordenes_trabajo as Row[]) { o.paro ??= true; o.dano_id ??= null; o.causa_id ??= null; o.accion_id ??= null }
  ;(ordenes_trabajo.find(o => o.id === 'ot2') as Row).dano_id = 'cf-D01'
  const requisitos_operacion = [
    { id: 'rq1', categoria_id: 'c2', modelo_id: null, tipo_documento: 'certificacion', descripcion: 'DC-3 operador de maquinaria pesada', bloquear: true, activo: true, created_at: hace(30) },
    { id: 'rq2', categoria_id: 'c1', modelo_id: null, tipo_documento: 'licencia_manejo', descripcion: 'Licencia de manejo vigente', bloquear: false, activo: true, created_at: hace(30) },
  ]
  const vales_salida = [
    { id: 'vs1', folio: 'VS-00001', token: uid(), empresa_id: 'e2', origen_id: 'u5', destino_id: 'u6', activos: ['a33'], material: [{ cantidad: 2, descripcion: 'rollos de cinta de precaución' }], transportista: 'José Manuel Higuera', vehiculo: 'CT-030', motivo: 'Demolición de caseta', vigencia: dia(1), estatus: 'en_transito', salida_at: hace(0.08), salida_por: 'Vigilante Ramírez', recibido_at: null, recibido_por: null, observaciones: null, created_by: 'u-demo', created_at: hace(0.1) },
    { id: 'vs2', folio: 'VS-00002', token: uid(), empresa_id: 'e1', origen_id: 'u1', destino_id: 'u3', activos: ['a9'], material: [], transportista: 'Luis Adrián Avilés Cota', vehiculo: 'CT-021', motivo: 'Laptop para residencia', vigencia: dia(2), estatus: 'emitido', salida_at: null, salida_por: null, recibido_at: null, recibido_por: null, observaciones: null, created_by: 'u-demo', created_at: hace(0.02) },
    { id: 'vs3', folio: 'VS-00003', token: uid(), empresa_id: 'e1', origen_id: 'u1', destino_id: 'u2', activos: ['a6'], material: [{ cantidad: 12, descripcion: 'cascos' }], transportista: 'Janani Aguilar', vehiculo: 'CT-014', motivo: null, vigencia: dia(-18), estatus: 'recibido', salida_at: hace(20), salida_por: 'Vigilante Soto', recibido_at: hace(19.9), recibido_por: 'Velador obra GF-214', observaciones: null, created_by: 'u-demo', created_at: hace(20.1) },
  ]

  const perfiles = [
    { id: 'u-demo', nombre: 'Oscar Cota', email: 'oscar@grupofirme.mx', rol: 'admin', activo: true, todas_empresas: true, empleado_id: null, created_at: hace(60) },
    { id: 'u-2', nombre: 'María Fernanda Ruiz', email: 'mruiz@grupofirme.mx', rol: 'consulta', activo: false, todas_empresas: false, empleado_id: null, created_at: hace(1) },
    { id: 'u-3', nombre: 'Luis Adrián Avilés', email: 'laviles@grupofirme.mx', rol: 'supervisor', activo: true, todas_empresas: false, empleado_id: 'em2', created_at: hace(20) },
  ]
  const db: DB = { empresas, sucursales: [], departamentos, empleados, ubicaciones, categorias, marcas, modelos, proveedores, activos, activo_vehiculo, activo_fotos,
    movimientos, movimiento_activos, reportes, inventarios, inventario_lecturas, documentos, kits, kit_items, confirmaciones, traspasos_empresa, planes_mantenimiento, lecturas, ordenes_trabajo, checklists, inmuebles, consumibles, montajes, codigos_falla, requisitos_operacion, vales_salida, movimientos_consumible, solicitudes, perfiles, perfil_empresas: [{ perfil_id: 'u-3', empresa_id: 'e1' }], bitacora: [] }
  return { db, urls }
}

// ───────── vistas ─────────
const nombre = (e?: Row) => e ? [e.nombres, e.apellidos].filter(Boolean).join(' ') : ''
function byId(db: DB, t: string, id: unknown) { return id == null ? undefined : db[t].find(r => r.id === id) }

function vista(db: DB, t: string): Row[] {
  if (t === 'v_activos') return db.activos.map(a => {
    const c = byId(db, 'categorias', a.categoria_id), u = byId(db, 'ubicaciones', a.ubicacion_id)
    return { ...a, empresa: byId(db, 'empresas', a.empresa_id)?.nombre, categoria: c?.nombre, es_vehiculo: c?.es_vehiculo,
      marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo: byId(db, 'modelos', a.modelo_id)?.nombre ?? null,
      ubicacion: u?.nombre ?? null, ubicacion_tipo: u?.tipo ?? null, responsable: nombre(byId(db, 'empleados', a.responsable_id)) || null,
      placa: db.activo_vehiculo.find(v => v.activo_id === a.id)?.placa ?? null,
      modelo_foto: byId(db, 'modelos', a.modelo_id)?.foto_path ?? null, responsable_puesto: byId(db, 'empleados', a.responsable_id)?.puesto ?? null }
  })
  if (t === 'v_movimientos') return db.movimientos.map(m => ({ ...m, empresa: byId(db, 'empresas', m.empresa_id)?.nombre,
    a_empleado: nombre(byId(db, 'empleados', m.a_empleado_id)), a_ubicacion: byId(db, 'ubicaciones', m.a_ubicacion_id)?.nombre ?? null,
    firmado: m.firma_recibe != null, num_activos: db.movimiento_activos.filter(x => x.movimiento_id === m.id).length,
    capturo: byId(db, 'perfiles', m.created_by)?.nombre ?? null }))
  if (t === 'v_mantenimiento') {
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)
    const out: Row[] = []
    for (const p of db.planes_mantenimiento.filter(x => x.activo)) {
      for (const a of db.activos.filter(x => x.estatus !== 'baja' && (x.id === p.activo_id || (!p.activo_id && x.modelo_id === p.modelo_id)))) {
        const u = db.ordenes_trabajo.filter(o => o.activo_id === a.id && o.plan_id === p.id && o.estatus === 'terminada').sort((x, y) => String(y.fecha_fin).localeCompare(String(x.fecha_fin)))[0]
        const tipoL = p.disparo === 'horas' ? 'horas' : 'km'
        const l = db.lecturas.filter(x => x.activo_id === a.id && x.tipo === tipoL).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0]
        const abierta = db.ordenes_trabajo.find(o => o.activo_id === a.id && o.plan_id === p.id && ['abierta', 'en_proceso', 'espera_refaccion'].includes(o.estatus as string))
        let restante: number, proxima_fecha: string | null = null, proxima_lectura: number | null = null
        if (p.disparo === 'dias') {
          const base = new Date(String(u?.fecha_fin ?? a.fecha_alta).slice(0, 10) + 'T00:00:00'); base.setDate(base.getDate() + Number(p.intervalo))
          proxima_fecha = base.toISOString().slice(0, 10); restante = Math.round((base.getTime() - hoy0.getTime()) / 864e5)
        } else { proxima_lectura = Number(u?.lectura ?? 0) + Number(p.intervalo); restante = proxima_lectura - Number(l?.valor ?? 0) }
        const mo = byId(db, 'modelos', a.modelo_id), e = byId(db, 'empresas', a.empresa_id)
        out.push({ plan_id: p.id, plan: p.nombre, disparo: p.disparo, intervalo: p.intervalo, avisar_antes: p.avisar_antes, tareas: p.tareas, activo_id: a.id, codigo: a.codigo, descripcion: a.descripcion,
          empresa_id: a.empresa_id, empresa: e?.nombre_corto ?? e?.nombre, estatus: a.estatus, marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo: mo?.nombre ?? null, modelo_foto: mo?.foto_path ?? null,
          foto_principal: a.foto_principal, categoria: byId(db, 'categorias', a.categoria_id)?.nombre, numero_economico: a.numero_economico, fecha_ultimo: u?.fecha_fin ?? null, lectura_ultimo: u?.lectura ?? null,
          lectura_actual: l?.valor ?? null, lectura_fecha: l?.fecha ?? null, proxima_fecha, proxima_lectura, restante, estado: restante < 0 ? 'vencido' : restante <= Number(p.avisar_antes) ? 'proximo' : 'ok',
          ot_abierta: abierta?.id ?? null, ot_folio: abierta?.folio ?? null })
      }
    }
    return out
  }
  if (t === 'v_vigencias') {
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)
    return db.documentos.filter(d => d.vigente && d.fecha_vencimiento).map(d => {
      const a = byId(db, 'activos', d.activo_id), e = byId(db, 'empresas', d.empresa_id)
      const [y, m, dd] = String(d.fecha_vencimiento).split('-').map(Number)
      const n = Math.round((new Date(y, m - 1, dd).getTime() - hoy0.getTime()) / 864e5)
      return { ...(d as Row), empresa: e?.nombre, empresa_corto: e?.nombre_corto ?? e?.nombre, activo_codigo: a?.codigo ?? null, activo_descripcion: a?.descripcion ?? null,
        marca: a ? byId(db, 'marcas', a.marca_id)?.nombre ?? null : null, modelo: a ? byId(db, 'modelos', a.modelo_id)?.nombre ?? null : null, numero_economico: a?.numero_economico ?? null,
        placa: a ? db.activo_vehiculo.find(v => v.activo_id === a.id)?.placa ?? null : null, empleado: nombre(byId(db, 'empleados', d.empleado_id)) || null,
        dias_restantes: n, estado: n < 0 ? 'vencido' : n <= Number(d.avisar_dias) ? 'por_vencer' : 'vigente',
        inmueble_codigo: byId(db, 'inmuebles', d.inmueble_id)?.codigo ?? null, inmueble: byId(db, 'inmuebles', d.inmueble_id)?.nombre ?? null }
    }).filter((v: Row) => !v.activo_id || byId(db, 'activos', v.activo_id)?.estatus !== 'baja')
  }
  if (t === 'v_existencias') {
    const m = new Map<string, Row>()
    for (const x of db.movimientos_consumible) {
      const c = byId(db, 'consumibles', x.consumible_id); if (!c || !c.activo) continue
      const k = `${x.consumible_id}|${x.empresa_id}|${x.ubicacion_id ?? ''}`
      const e = byId(db, 'empresas', x.empresa_id)
      const r = m.get(k) ?? { consumible_id: c.id, nombre: c.nombre, categoria: c.categoria, unidad: c.unidad, marca: c.marca, foto: c.foto, minimo: c.minimo, empresa_id: x.empresa_id, empresa: e?.nombre_corto ?? e?.nombre,
        ubicacion_id: x.ubicacion_id ?? null, ubicacion: byId(db, 'ubicaciones', x.ubicacion_id)?.nombre ?? null, existencia: 0, ultimo_movimiento: x.created_at }
      r.existencia = Number(r.existencia) + (x.tipo === 'salida' ? -Number(x.cantidad) : Number(x.cantidad))
      if (String(x.created_at) > String(r.ultimo_movimiento)) r.ultimo_movimiento = x.created_at
      m.set(k, r)
    }
    return [...m.values()]
  }
  if (t === 'v_prestamos') {
    const out: Row[] = []
    for (const a of db.activos) {
      if (a.estatus !== 'asignado') continue
      const ids = db.movimiento_activos.filter(x => x.activo_id === a.id).map(x => x.movimiento_id)
      const m = db.movimientos.filter(x => ids.includes(x.id) && !x.cancelado).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0]
      if (!m || !m.fecha_devolucion || !['asignacion', 'traspaso'].includes(m.tipo as string)) continue
      const mo = byId(db, 'modelos', a.modelo_id)
      out.push({ activo_id: a.id, codigo: a.codigo, descripcion: a.descripcion, serie: a.serie, empresa_id: a.empresa_id, empresa: byId(db, 'empresas', a.empresa_id)?.nombre,
        modelo: mo?.nombre ?? null, marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo_foto: mo?.foto_path ?? null, foto_principal: a.foto_principal,
        categoria: byId(db, 'categorias', a.categoria_id)?.nombre, movimiento_id: m.id, folio: m.folio, fecha: m.fecha, fecha_devolucion: m.fecha_devolucion,
        empleado_id: m.a_empleado_id, empleado: nombre(byId(db, 'empleados', m.a_empleado_id)) })
    }
    return out
  }
  return db[t] ?? []
}

// ───────── select con relaciones (subconjunto de PostgREST) ─────────
const FK: Record<string, string> = { empresa_id: 'empresas', departamento_id: 'departamentos', marca_id: 'marcas', modelo_id: 'modelos', activo_id: 'activos',
  movimiento_id: 'movimientos', responsable_id: 'empleados', padre_id: 'categorias', a_empleado_id: 'empleados', a_ubicacion_id: 'ubicaciones',
  responsable_anterior_id: 'empleados', ubicacion_anterior_id: 'ubicaciones', categoria_id: 'categorias', ubicacion_id: 'ubicaciones', inventario_id: 'inventarios', kit_id: 'kits', empleado_id: 'empleados', proveedor_id: 'proveedores', plan_id: 'planes_mantenimiento', consumible_id: 'consumibles', solicitud_id: 'solicitudes', inmueble_id: 'inmuebles', origen_id: 'ubicaciones', destino_id: 'ubicaciones', equipo_id: 'activos', componente_id: 'activos', montado_en: 'activos', dano_id: 'codigos_falla', causa_id: 'codigos_falla', accion_id: 'codigos_falla' }
const TABLA_FK: Record<string, string> = { empresas: 'empresa_id', departamentos: 'departamento_id', marcas: 'marca_id', modelos: 'modelo_id', activos: 'activo_id',
  movimientos: 'movimiento_id', empleados: 'responsable_id', categorias: 'categoria_id', ubicaciones: 'ubicacion_id', inventarios: 'inventario_id', proveedores: 'proveedor_id', consumibles: 'consumible_id' }

function partes(s: string) {
  const out: string[] = []; let d = 0, cur = ''
  for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = '' } else cur += ch }
  if (cur) out.push(cur); return out.map(x => x.trim()).filter(Boolean)
}
function proyectar(db: DB, fila: Row, sel: string): Row {
  const items = partes(sel)
  const out: Row = items.includes('*') ? { ...fila } : {}
  for (const it of items) {
    if (it === '*') continue
    const m = it.match(/^(?:(\w+):)?(\w+)\((.*)\)$/)
    if (!m) { const al = it.match(/^(\w+):(\w+)$/); if (al) out[al[1]] = fila[al[2]]; else out[it] = fila[it]; continue }
    const [, alias, target, inner] = m
    const INVERSA: Record<string, string> = { kit_items: 'kit_id' }
    if (INVERSA[target]) { out[alias ?? target] = (db[target] ?? []).filter(r => r[INVERSA[target]] === fila.id).map(r => proyectar(db, r, inner)); continue }
    let fk = target.endsWith('_id') ? target : TABLA_FK[target]
    if (target === 'empleados' && !(fk in fila) && 'empleado_id' in fila) fk = 'empleado_id'
    const tabla = target.endsWith('_id') ? FK[target] : target
    const rel = byId(db, tabla, fila[fk])
    out[alias ?? target] = rel ? proyectar(db, rel, inner) : null
  }
  return out
}

function aplicaFiltro(r: Row, k: string, v: string): boolean {
  const val = r[k]
  const [op, ...rest] = v.split('.'); const arg = rest.join('.')
  switch (op) {
    case 'eq': return String(val) === arg
    case 'neq': return String(val) !== arg
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')).includes(String(val))
    case 'ilike': { const re = new RegExp('^' + arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); return re.test(String(val ?? '')) }
    case 'is': return arg === 'null' ? val == null : String(val) === arg
    case 'not': return !aplicaFiltro(r, k, arg)
    case 'lt': case 'lte': case 'gt': case 'gte': {
      if (val == null) return false
      const x = typeof val === 'number' ? val : String(val), y = typeof val === 'number' ? Number(arg) : arg
      return op === 'lt' ? x < y : op === 'lte' ? x <= y : op === 'gt' ? x > y : x >= y
    }
    default: return true
  }
}
function filtrar(rows: Row[], params: URLSearchParams) {
  let out = rows
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    if (k === 'or') {
      const conds = partes(v.replace(/^\(|\)$/g, '')).map(c => { const i = c.indexOf('.'); return [c.slice(0, i), c.slice(i + 1)] })
      out = out.filter(r => conds.some(([ck, cv]) => aplicaFiltro(r, ck, cv)))
    } else out = out.filter(r => aplicaFiltro(r, k, v))
  }
  return out
}
function ordenar(rows: Row[], order: string | null) {
  if (!order) return rows
  const keys = order.split(',').map(o => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' } })
  return [...rows].sort((a, b) => {
    for (const { k, desc } of keys) {
      const x = a[k] as never, y = b[k] as never
      if (x === y) continue
      if (x == null) return 1; if (y == null) return -1
      return (x > y ? 1 : -1) * (desc ? -1 : 1)
    }
    return 0
  })
}

// ───────── reglas ─────────
let folioAct = 0, folioRes = 0, lecturasDemo = 0
function defaults(db: DB, t: string, r: Row): Row {
  const base: Row = { id: r.id ?? uid(), created_at: new Date().toISOString(), ...r }
  if (['empresas', 'sucursales', 'departamentos', 'empleados', 'ubicaciones', 'categorias', 'marcas', 'modelos', 'proveedores'].includes(t) && base.activo === undefined) base.activo = true
  if (t === 'reportes') { base.folio ??= 'FAL-' + String(db.reportes.length + 1).padStart(5, '0'); base.estatus ??= 'abierto'; base.prioridad ??= 'media' }
  if (t === 'ordenes_trabajo') { base.folio ??= 'OT-' + String(db.ordenes_trabajo.length + 1).padStart(5, '0'); base.estatus ??= 'abierta'; base.fotos_antes ??= []; base.fotos_despues ??= []; base.checklist ??= []; base.updated_at = base.created_at }
  if (t === 'lecturas') { base.fecha ??= new Date().toISOString(); base.origen ??= 'manual' }
  if (t === 'planes_mantenimiento') { base.activo ??= true; base.avisar_antes ??= 0; base.tareas ??= [] }
  if (t === 'traspasos_empresa') { base.folio ??= 'TRE-' + String(db.traspasos_empresa.length + 1).padStart(5, '0'); base.estatus ??= 'pendiente' }
  if (t === 'confirmaciones') { base.token ??= uid(); base.estatus ??= 'pendiente' }
  if (t === 'kits' || t === 'consumibles') { base.activo ??= true }
  if (t === 'vales_salida') { base.folio ??= 'VS-' + String(db.vales_salida.length + 1).padStart(5, '0'); base.token ??= uid(); base.estatus ??= 'emitido'; base.material ??= []; base.activos ??= [] }
  if (t === 'codigos_falla' || t === 'requisitos_operacion') { base.activo ??= true }
  if (t === 'montajes') { base.montado_at ??= base.created_at; base.desmontado_at ??= null }
  if (t === 'inmuebles') { base.codigo ??= 'INM-' + String(db.inmuebles.length + 1).padStart(4, '0'); base.activo ??= true; base.servicios ??= []; base.updated_at = base.created_at }
  if (t === 'consumibles') { base.minimo ??= 0; base.unidad ??= 'pieza' }
  if (t === 'solicitudes') { base.folio ??= 'SOL-' + String(db.solicitudes.length + 1).padStart(5, '0'); base.estatus ??= 'pendiente'; base.created_by ??= 'u-demo' }
  if (t === 'movimientos_consumible') { base.created_by ??= 'u-demo' }
  if (t === 'inventarios') { base.folio ??= 'INV-' + String(db.inventarios.length + 1).padStart(4, '0'); base.estatus ??= 'abierto'; base.resumen ??= null }
  if (t === 'activos') {
    folioAct = Math.max(folioAct, db.activos.length)
    base.codigo ??= 'ACT-' + String(++folioAct).padStart(6, '0'); base.qr ??= uid(); base.estatus ??= 'disponible'
    base.fecha_alta ??= hoy; base.updated_at = base.created_at
  }
  return base
}
function bitacora(db: DB, tabla: string, accion: string, antes: Row | null, despues: Row | null) {
  if (tabla !== 'activos') return
  db.bitacora.push({ id: db.bitacora.length + 1, tabla, registro_id: (despues ?? antes)!.id, accion, antes, despues, fecha: new Date().toISOString(), usuario_id: 'u-demo' })
}

function registrarMovimiento(db: DB, p: Row) {
  const tipo = p.p_tipo as string, ids = p.p_activos as string[]
  const acts = db.activos.filter(a => ids.includes(a.id as string))
  if (!acts.length) throw new Error('Selecciona al menos un activo')
  if (tipo === 'asignacion' && !p.p_a_empleado) throw new Error('La asignación necesita a quién se entrega')
  if (tipo === 'devolucion' && !p.p_a_ubicacion) throw new Error('La devolución necesita a dónde regresa el activo')
  for (const a of acts) {
    if (tipo === 'asignacion' && a.estatus !== 'disponible') throw new Error(`${a.codigo} no está disponible (estatus: ${a.estatus})`)
    if (tipo === 'devolucion' && a.estatus !== 'asignado') throw new Error(`${a.codigo} no está asignado`)
  }
  folioRes = Math.max(folioRes, db.movimientos.length)
  const id = uid()
  db.movimientos.push({ id, folio: 'RES-' + String(++folioRes).padStart(6, '0'), tipo, empresa_id: p.p_empresa, fecha: new Date().toISOString(),
    a_empleado_id: p.p_a_empleado ?? null, a_ubicacion_id: p.p_a_ubicacion ?? null, entrega_nombre: p.p_entrega_nombre || null, recibe_nombre: p.p_recibe_nombre || null,
    notas: p.p_notas || null, firma_recibe: null, firma_entrega: null, documento: null, cancelado: false, created_by: 'u-demo' })
  const est = (p.p_estados ?? {}) as Record<string, string>
  for (const a of acts) {
    db.movimiento_activos.push({ movimiento_id: id, activo_id: a.id, responsable_anterior_id: a.responsable_id, ubicacion_anterior_id: a.ubicacion_id, estatus_anterior: a.estatus, estado_fisico: est[a.id as string] || null })
    const antes = { ...a }
    if (tipo === 'asignacion') { a.responsable_id = p.p_a_empleado; a.estatus = 'asignado' }
    if (tipo === 'devolucion') { a.responsable_id = null; a.estatus = 'disponible' }
    if (tipo === 'traspaso' && p.p_a_empleado) { a.responsable_id = p.p_a_empleado; if (a.estatus === 'disponible') a.estatus = 'asignado' }
    if (p.p_a_ubicacion) a.ubicacion_id = p.p_a_ubicacion
    a.updated_at = new Date().toISOString()
    bitacora(db, 'activos', 'UPDATE', antes, { ...a })
  }
  return id
}

// ───────── interceptor de fetch ─────────
export function instalarDemo(base: string) {
  const { db, urls } = crearDatos()
  ;(window as unknown as { __demoDb: unknown }).__demoDb = db
  ;(window as unknown as { __demoUrls: Record<string, string> }).__demoUrls = urls
  const user = { id: 'u-demo', email: 'oscar@grupofirme.mx', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { nombre: 'Oscar Cota' } }
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const sesion = () => { const exp = Math.floor(Date.now() / 1000) + 3600 * 24; return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-demo', role: 'authenticated', exp })}.demo`, refresh_token: 'demo', expires_in: 86400, expires_at: exp, token_type: 'bearer', user } }

  const mem = new Map<string, string>()
  // La vista previa arranca en la pantalla de acceso; estas son las credenciales de prueba.
  const CRED = { email: 'oscar@grupofirme.mx', password: 'Firme2026' }
  ;(window as unknown as { __DEMO_CRED: object }).__DEMO_CRED = CRED
  ;(window as unknown as { __DEMO_STORAGE: object }).__DEMO_STORAGE = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } }

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    if (!req.url.startsWith(base)) return original(input, init)
    await new Promise(r => setTimeout(r, 120))
    const url = new URL(req.url), path = url.pathname, method = req.method
    const texto = ['POST', 'PATCH', 'PUT'].includes(method) ? await req.text() : ''
    const body = texto ? (() => { try { return JSON.parse(texto) } catch { return texto } })() : null

    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/logout')) return json(null, 204)
      if (path.endsWith('/user')) return json(user)
      if (path.endsWith('/token')) {
        if (url.searchParams.get('grant_type') === 'password') {
          const b = body as { email?: string; password?: string }
          if (b?.email?.trim().toLowerCase() !== CRED.email || b?.password !== CRED.password)
            return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials', error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
        }
        return json(sesion())
      }
      if (path.endsWith('/signup')) return json(sesion())
      return json({})
    }
    if (path.startsWith('/storage/v1/')) {
      if (method === 'POST' && path.includes('/object/') && !path.includes('/sign/')) {
        const key = decodeURIComponent(path.split('/object/')[1].split('/').slice(1).join('/'))
        try { urls[key] = URL.createObjectURL(new Blob([await req.clone().arrayBuffer()], { type: req.headers.get('content-type') ?? 'image/png' })) } catch { /* sin vista */ }
        return json({ Key: key })
      }
      return json([])
    }
    if (path.startsWith('/rest/v1/rpc/tipo_equipo_por_qr')) {
      const a = db.activos.find(x => x.qr === body?.p_qr && x.estatus !== 'baja'); if (!a) return json(null)
      const c = byId(db, 'categorias', a.categoria_id)
      return json(String(c?.nombre).toLowerCase().includes('maquinaria') ? 'maquinaria' : c?.es_vehiculo ? 'vehiculo' : 'otro')
    }
    if (path.startsWith('/rest/v1/rpc/registrar_checklist')) {
      const a = db.activos.find(x => x.qr === body?.p_qr && x.estatus !== 'baja')
      if (!a) return json({ message: 'Etiqueta no reconocida', code: 'P0001' }, 400)
      if (!String(body.p_operador ?? '').trim()) return json({ message: 'Escribe el nombre del operador', code: 'P0001' }, 400)
      const resp = body.p_respuestas as { punto: string; ok: boolean; nota: string }[]
      const malas = resp.filter(r => !r.ok)
      let rep: Row | null = null
      if (malas.length) { rep = defaults(db, 'reportes', { activo_id: a.id, empresa_id: a.empresa_id, tipo: 'falla', prioridad: 'media', descripcion: 'Checklist diario: ' + malas.map(m => m.punto + (m.nota ? ': ' + m.nota : '')).join('; '), foto: body.p_foto ?? null, reporta_nombre: body.p_operador, reporta_contacto: null, reportado_por: null, resolucion: null, resuelto_at: null }); db.reportes.push(rep) }
      db.checklists.push({ id: uid(), activo_id: a.id, empresa_id: a.empresa_id, operador: body.p_operador, lectura: body.p_lectura, respuestas: resp, todo_ok: !malas.length, foto: body.p_foto ?? null, reporte_id: rep?.id ?? null, registrado_por: null, created_at: new Date().toISOString() })
      if (body.p_lectura != null) { const cat = byId(db, 'categorias', a.categoria_id); db.lecturas.push({ id: uid(), activo_id: a.id, empresa_id: a.empresa_id, tipo: String(cat?.nombre).toLowerCase().includes('maquinaria') ? 'horas' : 'km', valor: Number(body.p_lectura), fecha: new Date().toISOString(), origen: 'checklist', registrado_por: null, nota: null }) }
      return json(rep?.folio ?? 'ok')
    }
    if (path.startsWith('/rest/v1/rpc/resguardo_por_token')) {
      const m = db.movimientos.find(x => x.token_firma && x.token_firma === body?.p_token && !x.cancelado)
      if (!m) return json(null)
      const e = byId(db, 'empresas', m.empresa_id)
      const acts = db.movimiento_activos.filter(x => x.movimiento_id === m.id).map(x => { const a = byId(db, 'activos', x.activo_id)!, mo = byId(db, 'modelos', a.modelo_id)
        return { codigo: a.codigo, descripcion: a.descripcion, marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo: mo?.nombre ?? null, serie: a.serie, estado: x.estado_fisico, foto: mo?.foto_path ?? null } })
      return json({ folio: m.folio, tipo: m.tipo, fecha: m.fecha, fecha_devolucion: m.fecha_devolucion ?? null, empresa: e?.razon_social ?? e?.nombre, recibe: m.recibe_nombre, entrega: m.entrega_nombre, notas: m.notas, firmado: m.firma_recibe != null, activos: acts })
    }
    if (path.startsWith('/rest/v1/rpc/firmar_resguardo')) {
      const m = db.movimientos.find(x => x.token_firma && x.token_firma === body?.p_token && !x.firma_recibe)
      if (!m) return json({ message: 'Este enlace ya se usó o no es válido', code: 'P0001' }, 400)
      const k = 'firma-remota-' + m.id; urls[k] = body.p_firma
      m.firma_recibe = k; m.firmado_remoto_at = new Date().toISOString(); m.token_firma = null; if (body.p_nombre) m.recibe_nombre = body.p_nombre
      return json(m.folio)
    }
    if (path.startsWith('/rest/v1/rpc/confirmacion_por_token')) {
      const c = db.confirmaciones.find(x => x.token === body?.p_token && x.estatus !== 'cancelado')
      if (!c) return json(null)
      const e = byId(db, 'empresas', c.empresa_id)
      return json({ empleado: nombre(byId(db, 'empleados', c.empleado_id)), empresa: e?.nombre_corto ?? e?.nombre, activos: c.activos, estatus: c.estatus, fecha: c.created_at })
    }
    if (path.startsWith('/rest/v1/rpc/responder_confirmacion')) {
      const c = db.confirmaciones.find(x => x.token === body?.p_token && x.estatus === 'pendiente')
      if (!c) return json({ message: 'Esta confirmación ya se respondió o no es válida', code: 'P0001' }, 400)
      const f = (body.p_faltantes ?? []) as string[]
      Object.assign(c, { estatus: f.length || String(body.p_comentario ?? '').trim() ? 'con_diferencias' : 'confirmado', faltantes: f.length ? f : null, comentario: String(body.p_comentario ?? '').trim() || null, firma: body.p_firma ?? null, respondido_at: new Date().toISOString() })
      return json('ok')
    }
    if (path.startsWith('/rest/v1/rpc/resolver_traspaso_empresa')) {
      const t = db.traspasos_empresa.find(x => x.id === body?.p_id && x.estatus === 'pendiente')
      if (!t) return json({ message: 'La solicitud ya fue resuelta', code: 'P0001' }, 400)
      if (body.p_aprobar) {
        const acts = db.activos.filter(a => (t.activos as string[]).includes(a.id as string))
        if (acts.some(a => a.empresa_id !== t.de_empresa_id || a.estatus === 'asignado')) return json({ message: 'Algún activo cambió de empresa o está asignado; devuélvelo antes de traspasar', code: 'P0001' }, 400)
        for (const a of acts) { const antes = { ...a }; a.empresa_id = t.a_empresa_id; a.ubicacion_id = t.a_ubicacion_id; a.responsable_id = null; if (!['baja', 'mantenimiento', 'siniestrado'].includes(a.estatus as string)) a.estatus = 'disponible'; bitacora(db, 'activos', 'UPDATE', antes, { ...a }) }
      }
      Object.assign(t, { estatus: body.p_aprobar ? 'aprobado' : 'rechazado', respuesta: body.p_respuesta || null, resuelto_por: 'u-demo', resuelto_at: new Date().toISOString() })
      return json(null, 204)
    }
    if (path.startsWith('/rest/v1/rpc/activo_por_qr')) {
      const a = db.activos.find(x => x.qr === body?.p_qr && x.estatus !== 'baja')
      if (!a) return json([])
      const e = byId(db, 'empresas', a.empresa_id), mo = byId(db, 'modelos', a.modelo_id)
      return json([{ codigo: a.codigo, descripcion: a.descripcion, marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo: mo?.nombre ?? null, empresa: e?.nombre_corto ?? e?.nombre, foto: mo?.foto_path ?? null }])
    }
    if (path.startsWith('/rest/v1/rpc/reportar_por_qr')) {
      const a = db.activos.find(x => x.qr === body?.p_qr && x.estatus !== 'baja')
      if (!a) return json({ message: 'Etiqueta no reconocida', code: 'P0001' }, 400)
      if (!String(body.p_descripcion ?? '').trim()) return json({ message: 'Describe el problema', code: 'P0001' }, 400)
      const r = defaults(db, 'reportes', { activo_id: a.id, empresa_id: a.empresa_id, tipo: body.p_tipo || 'falla', prioridad: ['robo', 'extravio'].includes(body.p_tipo) ? 'alta' : 'media',
        descripcion: String(body.p_descripcion).trim(), foto: body.p_foto ?? null, reporta_nombre: body.p_nombre || null, reporta_contacto: body.p_contacto || null, reportado_por: null, resolucion: null, resuelto_at: null })
      db.reportes.push(r)
      return json(r.folio)
    }
    if (path.startsWith('/rest/v1/rpc/registrar_movimiento')) {
      try { return json(registrarMovimiento(db, body)) } catch (e) { return json({ message: (e as Error).message, code: 'P0001' }, 400) }
    }
    if (path.startsWith('/rest/v1/rpc/vale_por_token')) {
      const v = db.vales_salida.find(x => x.token === body?.p_token)
      if (!v) return json(null)
      const e = byId(db, 'empresas', v.empresa_id)
      return json({ folio: v.folio, estatus: v.estatus, vigencia: v.vigencia, motivo: v.motivo, transportista: v.transportista, vehiculo: v.vehiculo, empresa: e?.nombre_corto ?? e?.nombre,
        origen: byId(db, 'ubicaciones', v.origen_id)?.nombre ?? null, destino: byId(db, 'ubicaciones', v.destino_id)?.nombre ?? null, material: v.material, salida_at: v.salida_at, salida_por: v.salida_por,
        recibido_at: v.recibido_at, recibido_por: v.recibido_por, emitido_at: v.created_at,
        activos: db.activos.filter(a => (v.activos as string[]).includes(a.id as string)).map(a => { const mo = byId(db, 'modelos', a.modelo_id); return { codigo: a.codigo, descripcion: a.descripcion, marca: byId(db, 'marcas', a.marca_id)?.nombre ?? null, modelo: mo?.nombre ?? null, serie: a.serie, eco: a.numero_economico, foto: mo?.foto_path ?? null } }) })
    }
    if (path.startsWith('/rest/v1/rpc/marcar_vale')) {
      const v = db.vales_salida.find(x => x.token === body?.p_token)
      const err = (m: string) => json({ message: m, code: 'P0001' }, 400)
      if (!String(body?.p_nombre ?? '').trim()) return err('Escribe tu nombre')
      if (!v) return err('Vale no reconocido')
      if (v.estatus === 'cancelado') return err('Este vale fue cancelado')
      const ahora = new Date().toISOString()
      if (body.p_accion === 'salida') {
        if (v.estatus !== 'emitido') return err('La salida ya se registró')
        if (String(v.vigencia) < hoy) return err(`El vale venció el ${v.vigencia}; pide uno nuevo`)
        Object.assign(v, { estatus: 'en_transito', salida_at: ahora, salida_por: body.p_nombre, observaciones: body.p_observaciones || null }); return json('Salida registrada')
      }
      if (v.estatus === 'recibido') return err('La llegada ya se registró')
      Object.assign(v, { estatus: 'recibido', recibido_at: ahora, recibido_por: body.p_nombre, salida_at: v.salida_at ?? ahora })
      for (const a of db.activos) if ((v.activos as string[]).includes(a.id as string) && a.empresa_id === v.empresa_id && a.estatus !== 'baja') a.ubicacion_id = v.destino_id
      return json('Llegada registrada')
    }
    if (path.startsWith('/functions/v1/leer-etiqueta')) {
      // En la vista previa no hay IA: simula dos lecturas típicas (una que está en el catálogo y otra que no).
      lecturasDemo++
      await new Promise(r => setTimeout(r, 1100))
      return json(lecturasDemo % 2 === 1
        ? { marca: 'Bosch', modelo: 'GBH 2-28', serie: 'BH-' + Math.floor(100000 + Math.random() * 899999), categoria: 'Herramienta', descripcion: 'Rotomartillo SDS Plus', confianza: 'alta' }
        : { marca: 'Milwaukee', modelo: 'M18 FUEL 2804', serie: 'J' + Math.floor(10000000 + Math.random() * 89999999), categoria: 'Herramienta', descripcion: 'Taladro percutor inalámbrico', confianza: 'media' })
    }
    if (path.startsWith('/functions/v1/preguntar')) return json({ error: 'En la vista previa no hay IA conectada.' }, 503)
    if (path.startsWith('/functions/v1/alertas-vigencias')) {
      const v = vista(db, 'v_vigencias'), hoy0 = new Date().toISOString().slice(0, 10)
      return json({ enviado: false, motivo: 'en la vista previa no se mandan correos (en la app real falta configurar la llave de Resend)', destinatarios: ['oscar@grupofirme.mx'],
        resumen: { documentos_vencidos: v.filter(x => x.estado === 'vencido').length, documentos_por_vencer: v.filter(x => x.estado === 'por_vencer').length,
          prestamos_vencidos: vista(db, 'v_prestamos').filter(p => String(p.fecha_devolucion) < hoy0).length, reportes_abiertos: db.reportes.filter(r => ['abierto', 'en_proceso'].includes(r.estatus as string)).length } })
    }
    if (!path.startsWith('/rest/v1/')) return json({})
    const tabla = path.split('/').pop()!
    const params = url.searchParams
    const unico = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object')
    const prefer = req.headers.get('prefer') ?? ''
    const sel = params.get('select') ?? '*'

    if (method === 'GET' || method === 'HEAD') {
      let rows = ordenar(filtrar(vista(db, tabla), params), params.get('order'))
      const total = rows.length
      const off = Number(params.get('offset') ?? 0), lim = params.get('limit') ? Number(params.get('limit')) : undefined
      rows = rows.slice(off, lim != null ? off + lim : undefined).map(r => proyectar(db, r, sel))
      if (unico) return rows.length ? json(rows[0]) : json({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406)
      return json(rows, 200, { 'Content-Range': `${off}-${off + rows.length - 1}/${prefer.includes('count=') ? total : '*'}` })
    }
    if (method === 'POST') {
      const lista: Row[] = Array.isArray(body) ? body : [body]
      const hechos: Row[] = []
      for (const r of lista) {
        if (tabla === 'activo_vehiculo') {
          const ex = db.activo_vehiculo.find(v => v.activo_id === r.activo_id)
          if (ex) { Object.assign(ex, r); hechos.push(ex); continue }
          db.activo_vehiculo.push({ ...r }); hechos.push(r); continue
        }
        if (tabla === 'marcas' && db.marcas.some(m => String(m.nombre).toLowerCase() === String(r.nombre).toLowerCase()))
          return json({ message: 'duplicate key value violates unique constraint', code: '23505' }, 409)
        const nueva = defaults(db, tabla, r); db[tabla].push(nueva); hechos.push(nueva); bitacora(db, tabla, 'INSERT', null, nueva)
      }
      const out = hechos.map(h => proyectar(db, h, sel))
      if (!prefer.includes('return=representation')) return json(null, 201)
      return unico ? json(out[0], 201) : json(out, 201)
    }
    if (method === 'PATCH') {
      const rows = filtrar(db[tabla] ?? [], params)
      if (tabla === 'activos' && body?.estatus === 'asignado' && !(body.responsable_id ?? rows[0]?.responsable_id))
        return json({ message: 'violates check constraint "asignado_requiere_responsable"', code: '23514' }, 400)
      rows.forEach(r => { const antes = { ...r }; Object.assign(r, body, tabla === 'activos' ? { updated_at: new Date().toISOString() } : {}); bitacora(db, tabla, 'UPDATE', antes, { ...r }) })
      return prefer.includes('return=representation') ? json(rows) : json(null, 204)
    }
    if (method === 'DELETE') {
      const rows = new Set(filtrar(db[tabla] ?? [], params))
      db[tabla] = (db[tabla] ?? []).filter(r => !rows.has(r))
      return json(null, 204)
    }
    return json({})
  }
}
