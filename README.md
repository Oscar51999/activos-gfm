# Activos · Grupo Firme

Sistema propio de control de activos: registro con QR, ubicación y responsable, fotos, etiquetas, tablero del grupo, resguardos con firma y carta responsiva. Fases 1 y 2 de 6.

## Partes

| Carpeta | Qué es |
| --- | --- |
| `web/` | App web (React + Vite + Tailwind). Se publica como sitio estático. |
| `supabase/migrations/` | Esquema de la base de datos en orden. Ya aplicado al proyecto `activos-grupo-firme`. |

## Base de datos (Supabase)

- Proyecto: `activos-grupo-firme` (ref `vbdpackixppvnujcwrog`, región us-west-1).
- Seguridad en la base (RLS): cada usuario ve solo sus empresas; solo Administrador y Almacén capturan; solo Administrador borra.
- El **primer usuario que se registre queda como Administrador activo**. Los siguientes quedan pendientes hasta que un administrador los active en *Usuarios*.
- Funciones de seguridad en el esquema `privado` (no expuesto por la API).
- `0003_ajuste_politicas_rendimiento.sql` está pendiente de aplicar (solo rendimiento, no seguridad).

## Resguardos (Fase 2)

- Asignación, devolución y traspaso de uno o varios activos en un solo movimiento, con folio `RES-000001`.
- Todo pasa por la función `registrar_movimiento` (atómica): valida estatus, empresa y destino, guarda el movimiento y actualiza los activos. No se puede asignar un activo ya asignado.
- Firma en pantalla de quien entrega y quien recibe (dedo, lápiz o mouse), o carta impresa firmada a mano y subida escaneada.
- Carta responsiva imprimible por movimiento y resguardo vigente consolidado por empleado.
- Supervisor puede registrar resguardos y firmar, pero no editar activos.

## Catálogo, alta rápida y empresas (Fase 2.5)

- **Producto** = marca + modelo + categoría + foto de referencia (tabla `modelos`). Se captura una vez.
- **Alta rápida** (`/alta`): producto → empresa y series (se pueden pegar desde Excel) → ubicación y, opcional, empleado (genera el resguardo).
- **Empresas** (`/empresas`): tarjetas con logo y KPIs; ficha con Resumen, Empleados (alta e importación desde Excel), Activos y Ubicaciones.
- **Ficha de empleado** (`/empleados/:id`): todo lo que tiene asignado con fotos, historial y acciones.
- Logos: `empresas.logo_path`/`logo_oscuro` aceptan `app:<clave>` (incluidos en `src/assets/logos`) o una imagen subida (se quita el fondo y se genera la versión oscura en el navegador).

## Control (Fase 3A)

- **Préstamos** (`/prestamos`): resguardos con fecha de regreso (`movimientos.fecha_devolucion`, vista `v_prestamos`), vencidos en el tablero.
- **Reportes de falla** (`/reportes`): cualquiera que escanee una etiqueta, aun sin cuenta, reporta con foto (funciones `activo_por_qr` y `reportar_por_qr`).
- **Inventario físico** (`/inventarios`): conteos por ubicación con cámara, lector o teclado; faltantes y fuera de lugar.

## Documentos y vigencias (Fase 3B)

- Tabla `documentos` (de un activo o de un empleado): póliza, tarjeta de circulación, verificación, calibración, garantía, arrendamiento, permiso, factura, pedimento, licencia de manejo, certificación. Archivo en storage `<empresa>/documentos/`. Renovar crea uno nuevo y deja el anterior como historial.
- Vista `v_vigencias` con estado vencido / por vencer / vigente según `avisar_dias`. Página `/vigencias` con calendario de 6 meses.
- Función `alertas-vigencias` (Edge Function, ya publicada): arma el resumen de documentos vencidos y por vencer, préstamos vencidos y reportes abiertos, y lo manda a admins y almacén con Resend.
  Para activarla: en Supabase → Edge Functions → Secrets agregar `RESEND_API_KEY`, `ALERTAS_REMITENTE`, `ALERTAS_SECRETO` y `APP_URL`; después programar el envío semanal (Integrations → Cron) llamando a la función con el encabezado `x-alertas-secreto`. Un admin puede probarla desde Vigencias → “Probar aviso por correo”.

## Control de personal (Fase 3C)

- **Kits por puesto** (`/kits`, tablas `kits` y `kit_items`): al entregar un kit se apartan unidades disponibles de cada producto en la empresa del empleado y se abre el resguardo ya armado.
- **Baja de empleado**: `empleados.fecha_baja` y `motivo_baja`; si tiene activos, primero se registra la devolución (un admin puede forzar).
- **Firma a distancia**: `movimientos.token_firma`; enlace `#/firmar/<token>` sin cuenta (funciones `resguardo_por_token`, `firmar_resguardo`). La firma se guarda en la carta.
- **Confirmación de resguardo** (`/confirmaciones`, tabla `confirmaciones`): enlace `#/confirmar/<token>` (funciones `confirmacion_por_token`, `responder_confirmacion`); se manda por WhatsApp.
- **Traspasos entre empresas** (`/traspasos`, tabla `traspasos_empresa`): lo solicita almacén y lo aprueba un admin con `resolver_traspaso_empresa`.
- **Línea de tiempo** del activo: alta, resguardos, reportes, documentos, conteos y cambios.

## Mantenimiento y flotilla (Fase 4)

- **Planes preventivos** (`planes_mantenimiento`): por producto o por unidad, cada N días, km u horas, con aviso anticipado y lista de tareas.
- **Lecturas** (`lecturas`): odómetro y horómetro (manual, desde checklist o al cerrar una orden).
- **Órdenes de trabajo** (`ordenes_trabajo`, OT-00001): preventivas o correctivas (desde un reporte), taller o mecánico, checklist, fotos de antes y después, refacciones; al iniciar pone el activo en mantenimiento y al terminar lo regresa, resuelve el reporte y reinicia el conteo del preventivo.
- **Programa** (vista `v_mantenimiento`): próximo servicio, restante y estado (vencido / próximo / ok).
- **Checklist diario del operador** (`checklists`, función `registrar_checklist`): desde la ficha o escaneando el QR sin cuenta; si algo falla abre un reporte y guarda la lectura.

## Almacén, solicitudes y mapa (Fase 5)

- **Almacén de consumibles** (`consumibles`, `movimientos_consumible`, vista `v_existencias`): artículos sin serie por cantidad (EPP, brocas, discos). Entrada, entrega a empleado u obra, mover entre lugares y ajuste por conteo. Mínimo por empresa con aviso en tablero y menú. Lo entregado a cada empleado aparece en su expediente.
- **Solicitudes** (`solicitudes`, SOL-00001): cualquier usuario pide equipo del catálogo, material o algo fuera de catálogo; almacén aprueba o rechaza y al entregar aparta unidades disponibles, crea el resguardo y descuenta el material. Lo que no hubo queda anotado. Sin compras ni costos.
- **Mapa de obras** (`/mapa`): dibujado en la app (sin servicios externos) con las coordenadas de `ubicaciones`; tamaño por número de activos, color por empresa, aviso de reportes abiertos, enlace “Cómo llegar” a Google Maps. Un admin coloca un lugar tocando el mapa o pegando el enlace de Google Maps.

## Inmuebles (Fase 3B, cierre)

- Tabla `inmuebles` (INM-0001): terreno, oficina, bodega, taller, campamento, patio, casa para personal o edificación en proceso; clasificación, situación, superficies, dirección, clave catastral, servicios, colindancias, foto y coordenadas. Puede ligarse a una ubicación donde hay activos.
- `documentos` ahora acepta `inmueble_id` y `subtipo` (tipo de plano o de seguro) con 24 tipos de inmueble: escritura, Registro Público, catastro, predial, constancias, avisos del Ayuntamiento, avalúo, compraventa, hipoteca, opinión de valor, licencia de funcionamiento, uso de suelo, Protección Civil (dictamen, primeros auxilios, PIPC), medio ambiente, fumigación, residuos, plano, arrendamiento, seguro, licencia de construcción, terminación de obra, daños patrimoniales. Sin montos.
- **Expediente básico** con semáforo (escritura, Registro Público, predial, uso de suelo, Protección Civil, seguro). Vencimientos en Vigencias, en el correo semanal y como rombos en el mapa.

## Inteligencia (Fase 6)

- **Alta por foto** (función `leer-etiqueta`): en Alta rápida, “Tomar foto de la etiqueta”; la IA lee marca, modelo y serie, busca el producto en el catálogo y llena la serie. Si no existe, abre el producto nuevo ya llenado.
- **Pregúntale** (función `preguntar`, `/preguntar` y desde Ctrl+K): preguntas en español; la IA consulta con la sesión de quien pregunta (respeta permisos, solo lectura). Si la IA no está configurada o no hay señal, contesta un intérprete local para las preguntas comunes. Dictado por voz donde el navegador lo permite.
- **App instalable y sin señal**: `manifest.webmanifest`, íconos y `sw.js` (la app abre sin internet; las consultas muestran la última copia). Las altas de inventario físico, lecturas y almacén hechas sin señal se guardan en el equipo y se mandan solas al volver (`src/lib/sinSenal.ts`). Indicador en la barra superior. Al cerrar sesión se borra la copia de datos.
- **Para activar la IA:** en Supabase → Edge Functions → Secrets agregar `ANTHROPIC_API_KEY` (y opcional `ANTHROPIC_MODEL`). Sin la llave todo lo demás funciona.

## Ideas de SAP PM / EHS (Fase 7)

- **Componentes** (`activos.montado_en`, `montajes`): aditamentos y accesorios montados en un equipo (martillo y cucharón de la retro, cargador de la laptop) con historial de montaje y desmontaje. Panel en la ficha del activo.
- **Catálogo de fallas** (`codigos_falla`, columnas `dano_id`, `causa_id`, `accion_id`, `paro` en `ordenes_trabajo`): al terminar una orden se elige qué falló, por qué y qué se hizo. Se administra en Catálogos → Códigos de falla.
- **Confiabilidad** (`/confiabilidad`): disponibilidad por equipo, tiempo entre fallas (MTBF), tiempo de reparación (MTTR), tiempo parado, uso (km/horas) y gráficas de qué falla más y por qué; periodo de 30/90/365 días.
- **Requisitos para operar** (`requisitos_operacion`): por categoría o producto, qué documento vigente necesita el empleado (licencia o DC-3). Al hacer el resguardo avisa o bloquea; solo un administrador puede autorizar sin el documento (queda en las notas).
- **Vales de salida** (`vales_salida`, VS-00001, funciones `vale_por_token` y `marcar_vale`): para mover equipo entre obras. Vigilancia escanea el QR del vale en la caseta (sin cuenta) y registra salida y llegada; al llegar, el equipo cambia de ubicación solo. Vigencia, cancelación e impresión.

## Almacén de clase mundial (Fase 8)

- **Etiquetas térmicas y RFID** (`/etiquetas`): tres modos, hoja carta, impresora de tickets (una etiqueta por página con el tamaño exacto) y RFID en lenguaje ZPL. Para RFID se graba el EPC (`activos.rfid_epc`, 24 hex = `47464D` + número del código) en el chip; se envía directo con Zebra Browser Print o se descarga el `.zpl`. Las impresoras TSC, Honeywell o SATO lo aceptan en modo de emulación ZPL.
- **Lectura RFID**: los lectores de mano en modo teclado escriben el EPC; Escanear, Inventario físico y Conteo cíclico lo reconocen. Si el lector manda muchas etiquetas a la vez y se pegan juntas, se registran todas.
- **Repuestos en mantenimiento** (`movimientos_consumible.ot_id`): en la orden de trabajo se sacan refacciones del almacén (eligiendo lote, primero lo que caduca antes). **Piezas críticas** (`piezas_criticas`) por modelo o por unidad, con aviso cuando hay menos del mínimo.
- **Lotes y caducidad** (`movimientos_consumible.lote/caducidad`, vista `v_lotes`): se capturan al registrar entradas; las salidas y traspasos eligen lote. La pestaña “Por caducar” muestra lo que vence en 30 días.
- **Mermas con aprobación** (`mermas`, MER-00001, función `resolver_merma`): daño, caducidad, extravío, etc., con foto. Otra persona (o un administrador) la aprueba y entonces se descuenta del almacén.
- **Posiciones** (`posiciones`, `activos.posicion_id`, `consumible_posiciones`, `/posiciones`): pasillo · rack · nivel por almacén, creadas en serie. La etiqueta QR de la posición lleva `POS:<id>`; al escanearla se abre lo que debe haber en ese lugar.
- **Conteo cíclico ABC** (`categorias.clase_abc`, `conteos_ciclicos`, vista `v_conteo_ciclico`, `/conteo-ciclico`): A cada 30 días, B cada 90 y C cada 180. Lista lo que toca contar, se escanea con QR, RFID o a mano y calcula la precisión del inventario.
- **Material en tránsito**: el vale de salida puede llevar material del almacén. Se descuenta del origen al emitir el vale, aparece “en tránsito” en Almacén y entra al destino cuando la obra marca la llegada. Si el vale se cancela, el material regresa al origen.
- **Integraciones** (Edge Functions con el encabezado `x-integracion-secreto` = secreto `INTEGRACION_SECRETO`):
  - `incidente-externo` (POST JSON `{activo, descripcion, prioridad, tipo, ticket, reporta_nombre}`): la mesa de ayuda crea un reporte de falla; si el mismo ticket llega dos veces no lo duplica.
  - `movimientos-export` (GET `?tipo=almacen|resguardos|vales&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&empresa=&formato=json|csv`): movimientos para otro sistema, solo cantidades y lugares, sin importes.

## Mapa de la República

- En **Empresas** (y en la pestaña Ubicaciones de cada empresa) aparece el mapa de México con los 32 estados (`web/src/lib/mapaMexico.ts`, contornos de Natural Earth). Los estados con obra se iluminan; al tocar uno se acerca a sus obras y al tocar una obra se ve su equipo y fallas abiertas. Con “Marcar obra” se da de alta una obra nueva o se ubica una existente tocando el mapa (o pegando el enlace de Google Maps).

## Empresas, buscador y desasignar

- Las empresas son las mismas 7 de los formularios del grupo (Grupo Firme de México, CISA, Vanguardia, MUPO, Inmobiliaria Atardecer de La Paz, Punta Cortez y Santa Cruz Fid). “Grupo Empresarial Firme” es el grupo, no una empresa elegible (quedó inactiva).
- **Buscador** (`components/BuscadorEmpresa.tsx`) en Empresas (eliges la empresa o todas) y dentro de cada empresa: activos, empleados, productos, marcas, obras, almacén, inmuebles y documentos; sin importar acentos.
- **Desasignar** (`components/Desasignar.tsx`): en la lista de empleados “Ver lo asignado” despliega todo lo que trae cada persona; se desasigna uno, varios o todo. Registra una devolución con folio (función `registrar_movimiento`) y el equipo queda disponible en el lugar elegido.

## Correr en local

```bash
cd web
npm install
npm run dev
```

La URL y la clave publicable de Supabase vienen por defecto en `src/lib/supabase.ts`; se pueden cambiar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`. La clave publicable es segura en el navegador.

## Publicar

```bash
cd web && npm run build   # genera web/dist
```

Publicado en GitHub Pages desde la carpeta `docs/` de la rama `main` (repo `Oscar51999/activos-gfm`): después de compilar, copiar `web/dist/*` a `docs/` y subir. Después, en Supabase → Authentication → URL Configuration, poner la URL publicada como *Site URL* y en *Redirect URLs*.

## Roadmap

0. Preparación · 1. **Registro de activos** ✅ · 2. **Resguardos y movimientos** ✅ · 2.5 **Catálogo, alta rápida y empresas** ✅ · 3A **Préstamos, reportes por QR, inventario físico** ✅ · 3B **Documentos y vigencias** ✅ · 3C **Control de personal** ✅ · 4 **Mantenimiento y flotilla** ✅ · 5 **Almacén, solicitudes y mapa** ✅ · **Inmuebles** ✅ · 6 **Inteligencia** ✅ (alta por foto, preguntas en español, app sin señal) · 7 **SAP PM/EHS** ✅ (componentes, fallas, confiabilidad, requisitos, vales) · 8 **Almacén de clase mundial** ✅ (RFID, tickets, lotes, mermas, posiciones, conteo cíclico, tránsito, integraciones)
