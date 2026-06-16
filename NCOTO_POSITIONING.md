# NCoto — Posicionamiento comercial MVP v1

**Enfoque:** control de acceso moderno para cotos — no ERP.  
**WOW:** mora automática en tiempo real.  
**Audiencia primaria:** administradoras de fraccionamientos y administradores de coto.

---

## Pitch corto (1 frase)

**NCoto digitaliza el acceso a tu fraccionamiento: pases QR, caseta en web o móvil, y morosidad que se aplica sola en tiempo real — sin dar el celular del vecino al guardia.**

---

## Elevator pitch (30–45 segundos)

Los fraccionamientos siguen operando visitas y morosos con llamadas, listas y WhatsApp del guardia. Eso genera filas, errores y conflictos en la caseta.

**NCoto** centraliza el acceso: el residente genera un pase digital, caseta valida con un escaneo — desde web en mostrador o app en campo — y la administración marca mora una vez; el sistema bloquea nuevos pases y el ingreso **al instante**, con datos privados por casa y trazabilidad de cada entrada.

No somos un ERP completo hoy: somos **la capa de acceso y control operativo** que reduce fricción y problemas desde el primer día.

---

## Cómo explicar el diferenciador

| Diferenciador | Mensaje para el cliente | Prueba en demo |
|---------------|-------------------------|----------------|
| **Mora automática** | “Un clic de mora y caseta deja de pasar gente, aunque traigan QR.” | Toggle admin → bloqueo caseta |
| **Tiempo real** | “El vecino y caseta ven el mismo estado sin llamar a oficina.” | Sin recargar app residente |
| **Privacidad** | “El guardia valida el pase, no el teléfono del vecino.” | Flujo QR + web caseta |
| **Caseta híbrida** | “Web en escritorio con lector; móvil si hace falta en campo.” | Laptop `/guardia/scan` |
| **Menos llamadas** | “El vecino avisa con QR; caseta ve la lista del día.” | Lista “previstas hoy” |
| **Trazabilidad** | “Cada ingreso queda registrado.” | Confirmación post-escaneo |
| **Multi-coto** | “Administradoras operan varios fraccionamientos sin mezclar datos.” | Selector coto (si aplica) |

---

## Cómo vender privacidad

**Problema del mercado:** grupos de WhatsApp, listas compartidas y celulares personales del guardia exponen números y rutinas de los vecinos.

**Narrativa NCoto:**

1. **Datos por fraccionamiento y por unidad** — no hay “lista global” de todos los residentes en un chat.
2. **El guardia trabaja el pase, no la agenda personal** — autorización vía QR/sistema.
3. **Roles separados** — residente, guardia y admin ven solo lo que corresponde (RLS).
4. **Roadmap honesto** — WhatsApp controlado llega en Fase 2 **sin** reemplazar el flujo core de acceso.

**Frase lista:** *“Privacidad operativa: menos exposición de teléfonos y más control en sistema.”*

---

## Cómo vender automatización

No vender “IA” ni “ERP”. Vender **automatización de reglas** que hoy son manuales:

- Vigencia del pase (día, horario frecuente, tipo servicio/paquetería).
- Bloqueo por mora en app **y** en caseta (misma regla, dos pantallas).
- Lista automática de visitas esperadas hoy en caseta.

**Frase lista:** *“Las reglas se aplican solas; la gente deja de discutir en la entrada.”*

---

## Cómo vender mora automática (WOW)

**Antes:** administración marca mora en Excel; caseta no se entera; el vecino sigue generando pases o entra con QR viejo.

**Con NCoto:**

1. Admin marca mora en panel (semáforo por casa).
2. Residente pierde capacidad de crear pases (servidor + UI).
3. Caseta recibe bloqueo explícito al escanear.

**Frase lista:** *“La mora deja de ser un problema de caseta — es una regla del sistema en tiempo real.”*

**Objeción común:** “Ya tenemos control de acceso físico.”  
**Respuesta:** “El torniquete no sabe si el vecino debe cuota; NCoto conecta cobranza operativa con la entrada.”

---

## Posicionamiento vs sistemas tradicionales

| Enfoque tradicional | NCoto MVP v1 |
|---------------------|--------------|
| Control de acceso hardware-centric | Acceso **digital** + reglas de negocio |
| Bitácora en papel / Excel | Trazabilidad en BD por visita |
| Moroso = discusión en caseta | Moroso = **bloqueo automático** |
| Comunicación por WhatsApp del guardia | Flujo oficial QR (WA del vecino opcional, no del guardia) |
| ERP / cobranza como proyecto largo | **Piloto rápido:** acceso + mora en semanas |
| Licencia monolítica pesada | Piloto por coto, multi-tenant |

**No competir en:** contabilidad, nómina, mantenimiento general — **sí competir en:** entrada, mora en puerta, experiencia vecino/guardia.

---

## Clientes a atacar primero

### Prioridad 1 — Ideal para piloto

- **Administradoras** con 3–20 cotos que ya sufren llamadas en caseta y morosos conflictivos.
- Fraccionamientos **medianos** (100–800 casas) con caseta física y personal rotativo.
- Administradores **digitalmente abiertos** (ya usan WhatsApp, quieren orden).

### Prioridad 2 — Buen fit después del primer caso

- Cotos **premium** que venden seguridad y privacidad como amenidad.
- Desarrollos nuevos que aún definen reglas de visita.

### Prioridad 3 — Más largo ciclo

- Mega-desarrollos con ERP ya contratado (integración Fase 3).
- Cotos sin caseta (solo remoto) — valor parcial.

---

## Ventajas de partnership con administradoras

| Ventaja para la administradora | Ventaja para NCoto |
|------------------------------|-------------------|
| Diferenciador vendible a desarrolladores/juntas | Distribución multi-coto |
| Estandarizar operación caseta entre fraccionamientos | Un seed → N pilotos |
| Reducir llamadas y quejas (métrica vendible) | Casos de estudio B2B2C |
| Superadmin / selector de coto ya en producto | Menor CAC por coto |
| Piloto acotado (no ERP) = decisión rápida | Feedback concentrado |

**Propuesta de partnership (borrador):**

> “Piloto en 1–2 fraccionamientos: acceso QR + caseta web + mora en tiempo real. Sin compromiso ERP. Éxito = menos llamadas a caseta y cero ingresos con mora activa.”

---

## Mensajes por rol (en reunión)

| Rol | Dolor | Promesa NCoto |
|-----|-------|--------------|
| **Administrador** | Morosos en puerta, caos visitas | “Un panel, reglas en todos lados” |
| **Caseta / guardia** | Presión y teléfonos | “Escaneas y listo; el sistema dice si hay mora” |
| **Residente** | Fila y trámites | “Generas tu pase desde el celular” |
| **Junta / desarrollador** | Imagen seguridad | “Acceso moderno y trazable” |

---

## Qué NO prometer en conversaciones MVP v1

Usar siempre: **“Roadmap — no incluido en piloto inicial”**

- WhatsApp integrado operativo  
- Push notifications  
- Comprobantes y tesorería  
- Emergencias con central  
- Uber / deliveries  
- IA / ERP completo  

---

## Taglines opcionales (marketing)

- *“Menos llamadas en caseta. Más control en la entrada.”*
- *“Mora que se nota en la puerta — al instante.”*
- *“El acceso de tu coto, en un solo sistema.”*

---

## Resumen estratégico

NCoto en MVP v1 es **infraestructura de acceso y disciplina operativa en la entrada**, no software contable. El comprador emocional es el **administrador** que quiere **menos problemas**; la prueba racional es la **demo mora + caseta** en 10 minutos.

---

*Alinear con ventas: cualquier promesa fuera de este documento y `NCOTO_MVP_SCOPE.md` debe aprobación de producto.*
