'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'

export type ActionState = { error: string } | null

export async function createCompany(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_company')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const display_name = formData.get('display_name') as string
  const legal_name = formData.get('legal_name') as string
  const slug = formData.get('slug') as string
  const tax_id = formData.get('tax_id') as string
  const address = formData.get('address') as string
  const phone = formData.get('phone') as string
  let report_logo_url = formData.get('report_logo_url') as string
  const logoFile = formData.get('logo_file') as File | null

  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.type.split('/')[1] || 'png'
    const filePath = `companies/logo_${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('employee-photos')
      .upload(filePath, logoFile, { upsert: true })
    if (!uploadError) {
      const { data } = supabase.storage.from('employee-photos').getPublicUrl(filePath)
      report_logo_url = data.publicUrl
    }
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No tienes una sesión activa para crear empresas (Server Action Auth failed).' }
  }

  const { data: newCompanyId, error } = await supabase.rpc('create_company_with_owner', {
    p_display_name: display_name,
    p_legal_name: legal_name,
    p_slug: slug.toLowerCase().replace(/\s+/g, '-'),
    p_tax_id: tax_id || null,
  })

  // Check if we need to update the newly created company with the extra fields
  if (newCompanyId && !error && (address || phone || report_logo_url)) {
    await supabase.from('companies').update({
      address: address || null,
      phone: phone || null,
      report_logo_url: report_logo_url || null,
    }).eq('id', newCompanyId)
  }


  if (error) {
    if (error.code === '23505' && error.message.includes('slug')) {
      return { error: 'El slug/identificador ya está en uso por otra empresa.' }
    }
    return { error: error.message }
  }

  revalidatePath('/organization/companies')
  revalidatePath('/organization')
  redirect('/organization/companies')
}

export async function updateCompany(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_company')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const display_name = formData.get('display_name') as string
  const legal_name = formData.get('legal_name') as string
  const slug = formData.get('slug') as string
  const tax_id = formData.get('tax_id') as string
  const address = formData.get('address') as string
  const phone = formData.get('phone') as string
  let report_logo_url = formData.get('report_logo_url') as string
  const logoFile = formData.get('logo_file') as File | null
  const is_active = formData.get('is_active') === 'on'

  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.type.split('/')[1] || 'png'
    const filePath = `companies/${id}_logo_${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('employee-photos')
      .upload(filePath, logoFile, { upsert: true })
    if (!uploadError) {
      const { data } = supabase.storage.from('employee-photos').getPublicUrl(filePath)
      report_logo_url = data.publicUrl
    }
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'No tienes una sesión activa.' }
  }

  const { error } = await supabase
    .from('companies')
    .update({
      display_name,
      legal_name,
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      tax_id: tax_id || null,
      address: address || null,
      phone: phone || null,
      report_logo_url: report_logo_url || null,
      is_active,
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505' && error.message.includes('slug')) {
      return { error: 'El slug ya está en uso por otra empresa.' }
    }
    return { error: error.message }
  }

  revalidatePath('/organization/companies')
  revalidatePath(`/organization/companies/${id}/edit`)
  revalidatePath('/organization')
  redirect('/organization/companies')
}
