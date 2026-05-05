'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'

export type ActionState = { error: string } | null

export async function createBranch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_company')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const company_id = formData.get('company_id') as string
  const address = formData.get('address') as string

  if (!name || !company_id) {
    return { error: 'El nombre y la empresa son requeridos.' }
  }

  const { error } = await supabase.from('branches').insert({
    name,
    code: code ? code : null,
    company_id,
    address: address || null,
    is_active: true,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/organization/branches')
  redirect('/organization/branches')
}

export async function updateBranch(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const perm = await requirePermission('can_manage_company')
  if (!perm.ok) return { error: perm.error }
  const supabase = await createClient()

  const name = formData.get('name') as string
  const code = formData.get('code') as string
  const company_id = formData.get('company_id') as string
  const address = formData.get('address') as string
  const is_active = formData.get('is_active') === 'on'

  if (!name || !company_id) {
    return { error: 'El nombre y la empresa son requeridos.' }
  }

  const { error } = await supabase
    .from('branches')
    .update({
      name,
      code: code ? code : null,
      company_id,
      address: address || null,
      is_active,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/organization/branches')
  redirect('/organization/branches')
}
