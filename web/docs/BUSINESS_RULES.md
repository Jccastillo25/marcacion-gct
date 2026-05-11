# Manual de Reglas de Negocio — Gestor360

## Gestión de Jornadas y Ley Laboral

### 1. Regla del Séptimo Día
Validación mandatoria en el sistema según legislación:
*   **Control Backend**: No se permite crear plantillas de turno que excedan los 6 días laborales consecutivos sin un día de descanso (`isSeventhDay: true`).
*   **Bonificación**: El trabajo en día de descanso se procesa como 100% extraordinario.

### 2. Estructura de "Turno Único"
Se ha corregido la fragmentación de turnos. En lugar de tener "Turno Administrativo" y "Turno Sabatino", se utiliza un **solo turno** con configuración diferenciada en la matriz `days_config`.
*   **Lunes a Viernes**: 07:30 - 17:00
*   **Sábado**: 08:00 - 15:00

### 3. Regla de Gracia INSS (5 Días)
Para garantizar la agilidad en la contratación sin comprometer el cumplimiento legal:
*   **Periodo de Gracia**: Los empleados nuevos sin número de INSS entran en estado `PENDING_GRACE`.
*   **Vencimiento**: El sistema otorga exactamente 5 días calendario desde la `hire_date` para regularizar el número.
*   **Alertas Administrativas**: El dashboard resalta en ROJO los trámites vencidos y en NARANJA los que vencen en <48h.

---

## Tolerancias y Deducciones

### 1. Tolerancia de Entrada (`late_entry_tolerance`)
*   Se otorga un periodo de gracia (típicamente 15 min).
*   Si se excede, el descuento se calcula desde el minuto 0 de la hora de entrada teórica.

### 2. Tolerancia de Salida (`early_exit_tolerance`)
*   Protege la integridad de la jornada completa.
*   Salidas anticipadas fuera del rango generan alertas en el Monitor.

### 3. Gestión de Pausas (`lunch_duration`)
*   El tiempo de almuerzo es configurable por plantilla.
*   Se deduce automáticamente del tiempo total trabajado para obtener las `payable_hours`.

---

## Reglas de Contratación y Legalidad

### 1. Unicidad de Contrato
*   Un empleado solo puede tener **un (1) contrato en estado `active`** simultáneamente. 
*   Al activar un nuevo contrato, el anterior se marca automáticamente como `expired` o `terminated`.

### 2. Inmutabilidad de Documentos Impresos
*   Si un contrato tiene el flag `is_printed: true` (indicando que ya fue generado para firma física), **no se permite su eliminación**.
*   Para corregir errores en contratos impresos, se debe proceder a la **Anulación (`annulled`)**, lo cual preserva la correlación de auditoría.

### 3. Vigencia de Documentos PDF
*   El sistema detecta discrepancias entre los datos del contrato en DB y el archivo subido en Storage.
*   Cualquier cambio en Salario, Turno o Puesto marca el documento actual como **"Desactualizado"**, exigiendo una nueva impresión y firma.

---

## Jerarquía de Prioridades (Resumen)
Para cualquier duda sobre qué turno aplica a un empleado, el sistema sigue este orden:
1. **Excepción de Día** (Manual Admin)
2. **Turno Fijo** (Legacy)
3. **Planilla del Puesto** (Global)
4. **Default de Sucursal** (Mínimo)

---

---

## Gestión de Solicitudes de Permisos/Vacaciones

### 1. Tipos de Permisos

Cada empresa puede definir sus propios tipos de permisos. Se incluyen 5 tipos por defecto:

*   **Vacaciones** (Vacation)
    - Máximo: 15 días por año
    - Requiere aprobación: Sí
    - Color: Verde (#10b981)

*   **Enfermedad** (Sickness)
    - Máximo: 30 días por año
    - Requiere aprobación: Sí
    - Color: Rojo (#ef4444)

*   **Asuntos Personales** (Personal)
    - Máximo: 3 días por año
    - Requiere aprobación: Sí
    - Color: Amarillo (#f59e0b)

*   **Maternidad/Paternidad** (Maternity/Paternity)
    - Máximo: 30 días por año
    - Requiere aprobación: Sí
    - Color: Púrpura (#8b5cf6)

*   **Duelo** (Bereavement)
    - Máximo: 3 días por año
    - Requiere aprobación: Sí
    - Color: Azul (#6366f1)

### 2. Estados de Solicitudes

Una solicitud de permiso transita por los siguientes estados:

```
Pending → Approved
       → Rejected
       → Cancelled
```

*   **Pending**: Estado inicial, esperando aprobación
*   **Approved**: Aprobado por un administrador
*   **Rejected**: Rechazado con motivo (opcional)
*   **Cancelled**: Cancelado por el empleado o administrador

### 3. Reglas de Creación

*   **Validación de fechas**: No se pueden crear solicitudes para fechas pasadas
*   **Rango válido**: `start_date <= end_date` (obligatorio)
*   **Cálculo automático**: El sistema calcula días = `(end_date - start_date) + 1`
*   **Sin solapamiento**: No se pueden crear dos solicitudes pendientes con mismo tipo y rango
*   **Propiedad**: Empleados solo pueden crear solicitudes para sí mismos (admins pueden crear para otros)

### 4. Reglas de Aprobación/Rechazo

*   **Permiso requerido**: `can_manage_leaves`
*   **Roles autorizados**: `admin`, `owner`, `rrhh`
*   **Registro de auditoría**: Se guarda `approved_by` (profile_id) y `approved_at` (timestamp)
*   **Motivo de rechazo**: Campo opcional `rejection_reason` para documentar el motivo

### 5. Reglas de Cancelación

*   **Empleados**: Pueden cancelar sus propias solicitudes en estado `pending`
*   **Administradores**: Pueden cancelar cualquier solicitud
*   **No retroactivo**: Una solicitud aprobada/rechazada no se puede cancelar

### 6. Validaciones Pendientes (Fase Futura)

*   **Balance de días**: No validar si el empleado tiene días disponibles (requiere tabla `leave_balances`)
*   **Conflicto con horario**: No validar solapamiento con horario laboral
*   **Notificaciones**: No enviar emails de aprobación/rechazo (requiere Edge Functions)

---

*Actualizado v1.2 — 8 de mayo de 2026*
