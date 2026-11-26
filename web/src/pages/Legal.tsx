import { Link } from 'react-router-dom'
import { ArrowLeft, Scale, ShieldCheck, Copyright } from 'lucide-react'
import { LogoFirme } from '../components/Logo'

export const AUTOR = 'Oscar Cota Latorre'
export const ACTUALIZADO = '26 de noviembre de 2026'
const CONTACTO = 'oscarcota@grupofirmedemexico.com'

function S({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-6">
      <h2 className="mb-2 mt-8 flex items-baseline gap-2 text-lg font-semibold"><span className="font-mono text-xs text-marca">{n}</span>{t}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-stone-600">{children}</div>
    </section>
  )
}
const L = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>

/** Aviso legal: propiedad intelectual del sistema, licencia de uso, aviso de privacidad y condiciones. Público (con o sin sesión). */
export default function Legal() {
  return (
    <div className="min-h-full px-4 py-8">
      <article className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <LogoFirme className="h-8 w-auto text-tinta" />
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-marca"><ArrowLeft size={15} />Volver</Link>
        </div>
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><Scale size={12} />Aviso legal</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Propiedad intelectual, términos de uso y aviso de privacidad</h1>
        <p className="mt-1 text-sm text-stone-500">Sistema de Control de Activos · Última actualización: {ACTUALIZADO}</p>

        <nav className="mt-5 grid gap-2 rounded-2xl border border-stone-200 p-4 text-sm sm:grid-cols-2">
          {[['1', 'Aceptación'], ['2', 'Autoría y propiedad intelectual'], ['3', 'Lo que no pertenece al autor'], ['4', 'Licencia de uso'], ['5', 'Usos prohibidos'], ['6', 'Aviso de privacidad'], ['7', 'Seguridad y confidencialidad'], ['8', 'Responsabilidad'], ['9', 'Cambios, ley aplicable y contacto']].map(([n, t]) => (
            <a key={n} href={`#s${n}`} onClick={e => { e.preventDefault(); document.getElementById(`s${n}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-stone-600 hover:text-marca"><span className="font-mono text-xs text-marca">{n}.</span> {t}</a>
          ))}
        </nav>

        <S n="1" t="Aceptación">
          <p>Al acceder, iniciar sesión, escanear una etiqueta o usar de cualquier forma este sistema, el usuario <b>reconoce, da fe y deja constancia</b> de que ha leído este aviso y acepta lo aquí establecido, en particular que la autoría y los derechos sobre el sistema corresponden a su autor en los términos del apartado 2, y que Grupo Empresarial Firme y sus empresas únicamente cuentan con una licencia de uso conforme al apartado 4, sin que el código ni la aplicación les pertenezcan. Si no está de acuerdo, debe abstenerse de usarlo.</p>
        </S>

        <S n="2" t="Autoría y propiedad intelectual">
          <p><b>{AUTOR}</b> es el autor del sistema “Control de Activos” y titular de los derechos de autor sobre él, conforme a la Ley Federal del Derecho de Autor y los tratados internacionales aplicables. Esto comprende, de manera enunciativa y no limitativa:</p>
          <L>
            <li>El código fuente y el código objeto, en todas sus versiones, así como sus scripts, funciones de base de datos, migraciones y automatizaciones.</li>
            <li>La arquitectura, la estructura y el diseño de la base de datos, los flujos de trabajo, los procesos y la lógica de cada módulo y función.</li>
            <li>El diseño de la interfaz, las pantallas, la organización visual, los íconos y elementos gráficos propios, los textos, los formatos, los reportes, las plantillas y la documentación.</li>
            <li>Las mejoras, actualizaciones, adaptaciones y nuevos módulos que el autor desarrolle.</li>
          </L>
          <p>Los derechos morales de autor son irrenunciables e inalienables: el nombre del autor debe respetarse y no puede retirarse ni sustituirse en el sistema ni en sus copias. El uso del sistema no implica cesión, venta ni transmisión de derechos patrimoniales a ninguna persona física o moral, salvo que exista un contrato por escrito firmado por el autor que expresamente lo establezca.</p>
          <p className="flex items-center gap-2 font-medium text-tinta"><Copyright size={15} />© 2026 {AUTOR}. Todos los derechos reservados.</p>
        </S>

        <S n="3" t="Lo que no pertenece al autor">
          <p>Quedan expresamente excluidos de la titularidad del autor:</p>
          <L>
            <li><b>Los nombres, logotipos, marcas y signos distintivos</b> de Grupo Empresarial Firme y de cada una de sus empresas, que pertenecen a sus respectivos titulares y se muestran solo para identificarlas.</li>
            <li><b>La información y los datos</b> que las empresas y sus usuarios capturan, cargan o generan en el sistema (activos, empleados, inmuebles, documentos, fotografías, firmas, reportes, etc.), que pertenecen a las empresas y, en lo que corresponda, a los titulares de los datos personales.</li>
            <li><b>Los componentes de terceros</b> (bibliotecas de código abierto, tipografías, mapas y servicios en la nube), que se rigen por sus propias licencias y condiciones.</li>
          </L>
        </S>

        <S n="4" t="Licencia de uso">
          <p><b>Lo que Grupo Empresarial Firme y sus empresas usan es una licencia de uso, no la propiedad del sistema.</b> El código fuente, el código objeto, la base de datos en su estructura y diseño, y la aplicación en su conjunto <b>no pertenecen a Grupo Empresarial Firme ni a ninguna de sus empresas</b>; son y seguirán siendo propiedad exclusiva de {AUTOR}.</p>
          <p>Se concede a las empresas de Grupo Empresarial Firme, y a los usuarios que estas autoricen, una <b>licencia de uso no exclusiva, intransferible, no sublicenciable y revocable</b>, únicamente para operar el sistema en sus actividades internas y mientras se mantenga la relación con el autor en los términos que se acuerden.</p>
          <L>
            <li>La licencia no otorga propiedad, copropiedad, acceso ni derecho alguno sobre el código fuente, ni sobre las copias, respaldos o repositorios donde se encuentre.</li>
            <li>El hecho de que el sistema se haya desarrollado, instalado, alojado o puesto en operación durante una relación laboral o de prestación de servicios con cualquiera de las empresas, o con equipo, cuentas o infraestructura de estas, <b>no transmite la titularidad del sistema</b> ni constituye una obra por encargo o una cesión de derechos, salvo contrato por escrito firmado por el autor que expresamente lo diga.</li>
            <li>Ningún pago, bono, compensación o uso prolongado del sistema implica la compra del código o de los derechos patrimoniales.</li>
            <li>Al terminar la licencia, las empresas conservan sus datos (apartado 3) y el autor conserva el sistema; el autor podrá entregar una exportación de la información en un formato de uso común.</li>
          </L>
        </S>

        <S n="5" t="Usos prohibidos">
          <p>Salvo autorización previa y por escrito del autor, queda prohibido:</p>
          <L>
            <li>Copiar, reproducir, descargar o extraer total o parcialmente el código, el diseño o la estructura del sistema.</li>
            <li>Modificar, adaptar, traducir, descompilar, desensamblar o aplicar ingeniería inversa.</li>
            <li>Crear obras derivadas o sistemas similares a partir de este.</li>
            <li>Vender, rentar, prestar, sublicenciar, distribuir o ponerlo a disposición de terceros, dentro o fuera del grupo.</li>
            <li>Retirar, ocultar o alterar los avisos de autoría y derechos.</li>
            <li>Usarlo para fines ilícitos o distintos a la operación interna, o intentar vulnerar su seguridad o acceder a información sin autorización.</li>
          </L>
          <p>El incumplimiento puede dar lugar a las acciones civiles, administrativas y penales que prevén las leyes mexicanas.</p>
        </S>

        <S n="6" t="Aviso de privacidad">
          <p className="flex items-center gap-2 font-medium text-tinta"><ShieldCheck size={15} />Emitido conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
          <p><b>Responsable.</b> La empresa de Grupo Empresarial Firme con la que el titular tiene relación es la responsable del tratamiento de sus datos personales. El sistema y su administración técnica están a cargo del Departamento de TICS, que atiende las solicitudes en el correo indicado abajo.</p>
          <p><b>Datos que se tratan.</b> Nombre, número de empleado, puesto, área y empresa; correo y teléfono de trabajo; usuario de acceso; firma autógrafa digitalizada en resguardos y actas; fotografías de equipo, entregas y daños; registros de uso (qué se consultó o modificó, fecha y hora); y, solo al escanear una etiqueta y si el navegador lo permite, la ubicación aproximada del dispositivo. <b>No se solicitan datos personales sensibles.</b></p>
          <p><b>Finalidades necesarias:</b> controlar los activos de las empresas y saber quién los tiene y dónde están; elaborar y firmar resguardos, préstamos, bajas y cartas de no adeudo; dar seguimiento a mantenimiento, fallas, inmuebles y servicios; enviar avisos por correo sobre los pendientes que corresponden a cada usuario; y mantener la seguridad, la trazabilidad y los respaldos del sistema. No se usan los datos con fines publicitarios.</p>
          <p><b>Proveedores y transferencias.</b> Para funcionar, el sistema usa proveedores de infraestructura que tratan los datos por cuenta del responsable (alojamiento de la página, base de datos en la nube y envío de correos). No se venden ni se ceden datos a terceros; solo se comunicarán a autoridades cuando una ley o una orden fundada lo exija.</p>
          <p><b>Derechos ARCO y revocación.</b> El titular puede solicitar el acceso, la rectificación, la cancelación u oponerse al tratamiento de sus datos, así como revocar su consentimiento o limitar su uso, escribiendo a <span className="select-all font-medium text-tinta">{CONTACTO}</span> con su nombre, la empresa, el derecho que ejerce y una identificación. La respuesta se dará en los plazos que marca la ley. Algunos datos deben conservarse mientras exista la relación laboral o un resguardo vigente, o por obligación legal.</p>
          <p><b>Almacenamiento en el dispositivo.</b> El navegador guarda la sesión y preferencias (tema, accesos) para que el sistema funcione; no se usan cookies de publicidad ni de rastreo de terceros.</p>
          <p><b>Cambios.</b> Este aviso puede actualizarse; la versión vigente siempre estará en esta página con su fecha. La autoridad en materia de protección de datos personales es la Secretaría Anticorrupción y Buen Gobierno.</p>
        </S>

        <S n="7" t="Seguridad y confidencialidad">
          <p>El sistema usa conexión cifrada (HTTPS), acceso con usuario y contraseña, permisos por rol, empresa y obra, y bitácora de cambios. Cada usuario es responsable de sus credenciales y de lo que se haga con su cuenta. La información del sistema es confidencial y solo puede usarse para los fines de la empresa.</p>
        </S>

        <S n="8" t="Responsabilidad">
          <p>El sistema se ofrece como herramienta de apoyo a la operación. La exactitud de la información depende de lo que capturan los usuarios. El autor no es responsable por el uso indebido del sistema, por información incorrecta capturada por terceros ni por fallas de los servicios de terceros en que se apoya, en la medida que la ley lo permita.</p>
        </S>

        <S n="9" t="Cambios, ley aplicable y contacto">
          <p>El autor puede actualizar estas condiciones; el uso posterior a la actualización implica su aceptación. Este aviso se rige por las leyes federales de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes de La Paz, Baja California Sur, renunciando a cualquier otro fuero que pudiera corresponderles.</p>
          <p>Contacto: <span className="select-all font-medium text-tinta">{CONTACTO}</span></p>
        </S>

        <p className="mt-10 border-t border-stone-200 pt-4 text-center text-xs text-stone-400">© 2026 {AUTOR}. Todos los derechos reservados. Los logotipos y la información pertenecen a sus respectivos titulares.</p>
      </article>
    </div>
  )
}

/** Enlace discreto al aviso legal para el pie de las pantallas. */
export function PieLegal({ className = '' }: { className?: string }) {
  return (
    <p className={`no-print text-center text-[11px] text-stone-400 ${className}`}>
      © 2026 {AUTOR} · <Link to="/legal" className="underline-offset-2 hover:text-marca hover:underline">Aviso legal y de privacidad</Link>
    </p>
  )
}
