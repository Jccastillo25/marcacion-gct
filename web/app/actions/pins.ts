'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/require-permission'

export async function resetEmployeePin(employeeId: string) {
  const perm = await requirePermission('can_manage_employees')
  if (!perm.ok) return { error: perm.error }

  const supabase = await createClient()

  // Obtener company_id del empleado
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('company_id')
    .eq('id', employeeId)
    .single()

  if (empErr || !employee?.company_id) {
    return { error: 'No se pudo obtener la información de la empresa del empleado.' }
  }

  // Generar nuevo PIN aleatorio y único
  const { generateUniquePin } = await import('@/lib/utils')
  const newPin = await generateUniquePin(supabase, employee.company_id)

  // Usar una transacción simple: 
  const { error: err1 } = await supabase
    .from('employees')
    .update({ employee_code: newPin })
    .eq('id', employeeId)

  if (err1) {
    if (err1.code === '23505') {
       return { error: 'Colisión temporal al generar el nuevo PIN. Por favor, intenta nuevamente.' }
    }
    return { error: err1.message }
  }

  // Marcar como inactivo el anterior (si la tabla se usa para historial riguroso)
  await supabase
    .from('employee_pins')
    .update({ is_active: false })
    .eq('employee_id', employeeId)
    .eq('is_active', true)

  // Insertar el nuevo pin en historial
  const { error: err2 } = await supabase
    .from('employee_pins')
    .insert({
      employee_id: employeeId,
      pin: newPin,
      is_active: true,
      last_reset_at: new Date().toISOString()
    })

  if (err2) {
    console.error("Error inserting pin history:", err2.message)
    // No fallamos toda la request si falla el historial secundario.
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath(`/(admin)/employees/${employeeId}`, 'page')
  
  return { success: true }
}
