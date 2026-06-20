'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'

export type ContractActionState = { error: string } | null

export async function createContract(
  _prevState: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const employee_id = formData.get('employee_id') as string
  const shift_template_id = formData.get('shift_template_id') as string // Refactor V3
  const company_id = formData.get('company_id') as string
  const branch_id = formData.get('branch_id') as string
  const contract_type = formData.get('contract_type') as string
  const salary = parseFloat(formData.get('salary') as string)
  const start_date = formData.get('start_date') as string
  const end_date = formData.get('end_date') as string
  const job_position_id = formData.get('job_position_id') as string
  const social_security_number = formData.get('social_security_number') as string
  const hire_date = formData.get('hire_date') as string

  if (!employee_id || !shift_template_id || !company_id || !branch_id || !job_position_id) {
    return { error: 'Empleado, turno, empresa, sucursal y puesto son requeridos.' }
  }

  // 1. Generate PIN (4 random digits)
  const pin = Math.floor(1000 + Math.random() * 9000).toString()

  // 2. Generate Employee Number (COMP-BR-XXX)
  const { data: company } = await supabase.from('companies').select('abbreviation').eq('id', company_id).single()
  const { data: branch } = await supabase.from('branches').select('code').eq('id', branch_id).single()
  
  const { count } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company_id)

  const seq = (count || 0) + 1
  const employee_number = `${company?.abbreviation || 'EMP'}-${branch?.code || 'SUC'}-${seq.toString().padStart(3, '0')}`

  // 3. Update Employee with PIN, Employee Number, Company, Branch AND INSS Logic
  const inss_status = social_security_number ? 'ACTIVE' : 'PENDING_GRACE'
  const hire_date_base = hire_date || start_date || new Date().toISOString()
  const grace_expiry = social_security_number 
    ? null 
    : new Date(new Date(hire_date_base).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { error: empUpdateErr } = await supabase
    .from('employees')
    .update({
      company_id,
      branch_id,
      pin,
      employee_number,
      employee_code: pin, // Legacy support
      hire_date: start_date,
      job_position_id,
      inss_status,
      inss_grace_expiry: grace_expiry
    })
    .eq('id', employee_id)

  if (empUpdateErr) {
    return { error: `Error al actualizar perfil de empleado: ${empUpdateErr.message}` }
  }

  // 4. Create the contract
  const { error: contractErr } = await supabase.from('contracts').insert({
    employee_id,
    shift_template_id,
    company_id,
    branch_id,
    contract_type,
    salary: isNaN(salary) ? 0 : salary,
    status: 'active',
    start_date: start_date || new Date().toISOString().split('T')[0],
    end_date: end_date || null,
    job_position_id,
    social_security_number: social_security_number || null,
    hire_date: hire_date || start_date || new Date().toISOString().split('T')[0],
  })



  if (contractErr) {
    return { error: `Error al crear contrato: ${contractErr.message}` }
  }

  // 5. Link shift in employee_shifts
  await supabase
    .from('employee_shifts')
    .update({ is_active: false })
    .eq('employee_id', employee_id)

  await supabase.from('employee_shifts').insert({
    employee_id,
    shift_template_id: shift_template_id,
    start_date: start_date,
    is_active: true,
  })

  revalidatePath('/employees')
  revalidatePath(`/employees/${employee_id}`)
  revalidatePath('/contracts')
  
  redirect('/contracts')
}

export async function updateContract(
  id: string,
  _prevState: ContractActionState,
  formData: FormData
): Promise<ContractActionState> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const shift_template_id = formData.get('shift_template_id') as string // Refactor V3
  const contract_type = formData.get('contract_type') as string
  const salary = parseFloat(formData.get('salary') as string)
  const start_date = formData.get('start_date') as string
  const end_date = formData.get('end_date') as string
  const status = formData.get('status') as string
  const job_position_id = formData.get('job_position_id') as string
  const social_security_number = formData.get('social_security_number') as string
  const hire_date = formData.get('hire_date') as string

  // 1. Update the contract
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .update({
      shift_template_id,
      contract_type,
      salary: isNaN(salary) ? 0 : salary,
      start_date,
      end_date: end_date || null,
      status: status || 'active',
      job_position_id: job_position_id || null,
      social_security_number: social_security_number || null,
      hire_date: hire_date || start_date || null,
    })


    .eq('id', id)
    .select()
    .single()

  if (contractErr) {
    return { error: `Error al actualizar contrato: ${contractErr.message}` }
  }

  const employee_id = contract.employee_id

  // 2. Sync with employee_shifts (if schedule or dates changed)
  // We'll follow the simple pattern of deactivating old ones for this employee
  await supabase
    .from('employee_shifts')
    .update({ is_active: false })
    .eq('employee_id', employee_id)

  await supabase
    .from('employee_shifts')
    .insert({
      employee_id,
      shift_template_id,
      start_date: start_date,
      is_active: true
    })

  // 3. Update Job Position in Employee record
  if (job_position_id) {
    await supabase
      .from('employees')
      .update({ job_position_id })
      .eq('id', employee_id)
  }

  revalidatePath('/employees')
  revalidatePath(`/employees/${employee_id}`)
  revalidatePath('/contracts')
  
  redirect('/contracts')
}

export async function markContractAsPrinted(id: string): Promise<{ error?: string }> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('contracts')
    .update({ is_printed: true })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/contracts')
  return {}
}

export async function annulContract(id: string): Promise<{ error?: string }> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('contracts')
    .update({ status: 'annulled', is_active: false })
    .eq('id', id)
  
  if (error) return { error: error.message }
  revalidatePath('/contracts')
  return {}
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  // 1. Check if already printed
  const { data: contract } = await supabase
    .from('contracts')
    .select('is_printed')
    .eq('id', id)
    .single()
  
  if (contract?.is_printed) {
    return { error: 'No se puede eliminar un contrato que ya ha sido impreso. Debe anularlo.' }
  }

  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/contracts')
  return {}
}

export async function uploadSignedContract(id: string, formData: FormData): Promise<{ error?: string, url?: string }> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }

  const supabase = await createClient()
  
  const file = formData.get('file') as File
  if (!file) return { error: 'No se encontró el archivo.' }

  const ext = file.name.split('.').pop()
  const fileName = `contract_${id}_${Date.now()}.${ext}`
  
  const { error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(fileName, file)
    
  if (uploadError) return { error: uploadError.message }
  
  const { data: publicUrlData } = supabase.storage.from('contracts').getPublicUrl(fileName)
  
  const { error } = await supabase
    .from('contracts')
    .update({ 
      document_url: publicUrlData.publicUrl,
      pdf_uploaded_at: new Date().toISOString()
    })
    .eq('id', id)
    
  if (error) return { error: error.message }
  
  revalidatePath('/contracts')
  revalidatePath(`/contracts/${id}/edit`)
  return { url: publicUrlData.publicUrl }
}

export async function createTemplate(name: string, content: string): Promise<{ error?: string }> {
  const perm = await requirePermission('can_manage_contracts')
  if (!perm.ok) return { error: perm.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('contract_templates')
    .insert([{ name, content }])
  
  if (error) return { error: error.message }
  revalidatePath('/contracts/templates')
  return {}
}
