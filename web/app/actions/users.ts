'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'

interface CreateUserInput {
  email: string
  password: string
  fullName: string
  position?: string
  companyIds: string[]
  primaryCompanyId: string
  linkedEmployeeId?: string | null
}

/**
 * Server Action: Crea un nuevo usuario con Auth + Profile + Memberships
 * Sigue el SSOT Protocol v3.4
 */
export async function createUserWithMemberships(input: CreateUserInput) {
  const adminClient = await createAdminClient()
  const serverClient = await createServerClient()

  try {
    // Step 1: Validar que el usuario actual tenga permisos (owner o admin)
    const { data: { user: currentUser } } = await serverClient.auth.getUser()
    if (!currentUser) {
      throw new Error('No autenticado')
    }

    const { data: currentMembership } = await serverClient
      .from('company_memberships')
      .select('role, company_id')
      .eq('profile_id', currentUser.id)
      .eq('company_id', input.primaryCompanyId)
      .single()

    if (!currentMembership || !['owner', 'admin'].includes(currentMembership.role)) {
      throw new Error('No tienes permisos para crear usuarios en esta empresa')
    }

    // Step 2: Crear usuario en Supabase Auth (como admin)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true, // Auto-confirmar para evitar email de verificación
    })

    if (authError || !authData.user) {
      throw new Error(`Error en Auth: ${authError?.message || 'Desconocido'}`)
    }

    const userId = authData.user.id

    // Step 3: Crear Profile (tabla profiles)
    const { error: profileError } = await serverClient
      .from('profiles')
      .insert({
        id: userId,
        full_name: input.fullName,
        email: input.email,
        company_id: input.primaryCompanyId,
        linked_employee_id: input.linkedEmployeeId || null,
      })

    if (profileError) {
      // Cleanup: Eliminar Auth user si falla el profile
      await adminClient.auth.admin.deleteUser(userId)
      throw new Error(`Error creando profile: ${profileError.message}`)
    }

    // Step 4: Crear Company Memberships para cada empresa seleccionada
    const memberships = input.companyIds.map(companyId => ({
      profile_id: userId,
      company_id: companyId,
      role: companyId === input.primaryCompanyId ? 'admin' : 'member', // Admin en empresa principal
    }))

    const { error: membershipError } = await serverClient
      .from('company_memberships')
      .insert(memberships)

    if (membershipError) {
      // Cleanup: Eliminar auth + profile
      await adminClient.auth.admin.deleteUser(userId)
      await serverClient.from('profiles').delete().eq('id', userId)
      throw new Error(`Error creando memberships: ${membershipError.message}`)
    }

    // Step 5: Crear entrada en users_identity (SSOT Protocol)
    const { error: identityError } = await serverClient
      .from('users_identity')
      .insert({
        id: userId,
        email: input.email,
        full_name: input.fullName,
        primary_company_id: input.primaryCompanyId,
        position: input.position || null,
        linked_employee_id: input.linkedEmployeeId || null,
      })

    if (identityError) {
      console.warn('Warning: SSOT identity entry failed:', identityError)
      // No hacer cleanup aquí - el usuario ya está creado, solo falta el SSOT
    }

    // Step 6: Crear audit log
    try {
      await serverClient
        .from('audit_logs')
        .insert({
          table_name: 'profiles',
          record_id: userId,
          action: 'CREATE',
          old_values: null,
          new_values: {
            email: input.email,
            full_name: input.fullName,
            companies: input.companyIds,
          },
          changed_by: currentUser.id,
        })
    } catch (err) {
      console.warn('Audit log failed:', err)
    }

    return {
      success: true,
      userId,
      message: `Usuario ${input.email} creado exitosamente`,
    }
  } catch (error: any) {
    console.error('createUserWithMemberships error:', error)
    return {
      success: false,
      error: error.message || 'Error desconocido al crear usuario',
      userId: null,
    }
  }
}

/**
 * Server Action: Obtener usuarios con sus memberships
 * Si se proporciona companyId, filtra usuarios que pertenecen a esa empresa
 */
export async function getUsers(companyId?: string) {
  const perm = await requirePermission('can_manage_users')
  if (!perm.ok) return { success: false, data: null, error: perm.error }

  const targetCompanyId = companyId ?? perm.companyId
  const supabase = await createServerClient()

  try {
    const { data, error } = await supabase
      .from('company_memberships')
      .select(`
        profile_id,
        role,
        profiles(
          id,
          full_name,
          email,
          company_id,
          linked_employee_id,
          created_at
        )
      `)
      .eq('company_id', targetCompanyId)

    if (error) throw error

    const formattedData = data?.map(membership => ({
      ...membership.profiles,
      company_memberships: [
        {
          role: membership.role,
          company_id: targetCompanyId,
        },
      ],
    })) || []

    return { success: true, data: formattedData, error: null }
  } catch (error: any) {
    console.error('getUsers error:', error)
    return { success: false, data: null, error: error.message }
  }
}

/**
 * Server Action: Actualizar usuario
 * Incluye rollback automático en caso de fallos en memberships
 */
export async function updateUser(
  userId: string,
  updates: {
    fullName?: string
    position?: string
    companyIds?: string[]
    primaryCompanyId?: string
  }
) {
  const perm = await requirePermission('can_manage_users')
  if (!perm.ok) throw new Error(perm.error)

  const supabase = await createServerClient()

  try {
    // Verificar que el usuario que se va a actualizar existe
    const { data: targetUser, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (fetchError || !targetUser) {
      throw new Error('Usuario no encontrado')
    }

    // Update profile
    if (updates.fullName !== undefined) {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: updates.fullName })
        .eq('id', userId)

      if (error) throw error
    }

    // Update memberships if needed - con rollback
    if (updates.companyIds && updates.companyIds.length > 0) {
      // Guardar memberships actuales para rollback
      const { data: currentMemberships } = await supabase
        .from('company_memberships')
        .select('*')
        .eq('profile_id', userId)

      // Intentar eliminar memberships antigas
      const { error: deleteError } = await supabase
        .from('company_memberships')
        .delete()
        .eq('profile_id', userId)

      if (deleteError) {
        throw new Error(`Error al eliminar memberships antiga: ${deleteError.message}`)
      }

      // Crear nuevas memberships
      const memberships = updates.companyIds.map(companyId => ({
        profile_id: userId,
        company_id: companyId,
        role: companyId === updates.primaryCompanyId ? 'admin' : 'member',
      }))

      const { error: insertError } = await supabase
        .from('company_memberships')
        .insert(memberships)

      if (insertError) {
        // Rollback: restaurar memberships antigas
        if (currentMemberships && currentMemberships.length > 0) {
          try {
            await supabase.from('company_memberships').insert(currentMemberships)
          } catch (err) {
            console.error('Rollback failed:', err)
          }
        }
        throw new Error(`Error al insertar nuevas memberships: ${insertError.message}`)
      }
    }

    // Audit log
    try {
      await supabase
        .from('audit_logs')
        .insert({
          table_name: 'profiles',
          record_id: userId,
          action: 'UPDATE',
          old_values: null,
          new_values: updates,
          changed_by: perm.userId,
        })
    } catch (err) {
      console.warn('Audit log failed:', err)
    }

    return { success: true, message: 'Usuario actualizado' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Server Action: Eliminar usuario
 * Valida permisos (owner/admin) antes de eliminar
 */
export async function deleteUser(userId: string) {
  const adminClient = await createAdminClient()
  const serverClient = await createServerClient()

  try {
    // Validar que el usuario actual sea owner o admin
    const { data: { user: currentUser } } = await serverClient.auth.getUser()
    if (!currentUser) throw new Error('No autenticado')

    // Verificar que currentUser tiene permisos (owner/admin) en alguna empresa
    const { data: currentPermissions, error: permError } = await serverClient
      .from('company_memberships')
      .select('role')
      .eq('profile_id', currentUser.id)

    if (permError || !currentPermissions || currentPermissions.length === 0) {
      throw new Error('No tienes permisos para eliminar usuarios')
    }

    const hasAdminRole = currentPermissions.some(m => ['owner', 'admin'].includes(m.role))
    if (!hasAdminRole) {
      throw new Error('Solo administradores pueden eliminar usuarios')
    }

    // Verificar que el usuario a eliminar existe
    const { data: targetUser, error: fetchError } = await serverClient
      .from('profiles')
      .select('id, company_id')
      .eq('id', userId)
      .single()

    if (fetchError || !targetUser) {
      throw new Error('Usuario no encontrado')
    }

    // Delete from company_memberships
    const { error: memberError } = await serverClient
      .from('company_memberships')
      .delete()
      .eq('profile_id', userId)

    if (memberError) throw memberError

    // Delete from users_identity
    const { error: identityError } = await serverClient
      .from('users_identity')
      .delete()
      .eq('id', userId)

    // No es crítico si esto falla
    if (identityError) console.warn('Warning deleting from users_identity:', identityError)

    // Delete from profiles
    const { error: profileError } = await serverClient
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) throw profileError

    // Delete Auth user
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('Warning: Auth user deletion failed:', authError)
      // No es crítico si Auth user no se eliminó - el usuario ya está marcado como eliminado en BD
    }

    // Audit log
    try {
      await serverClient
        .from('audit_logs')
        .insert({
          table_name: 'profiles',
          record_id: userId,
          action: 'DELETE',
          old_values: { id: userId, company_id: targetUser.company_id },
          new_values: null,
          changed_by: currentUser.id,
        })
    } catch (err) {
      console.warn('Audit log failed:', err)
    }

    return { success: true, message: 'Usuario eliminado exitosamente' }
  } catch (error: any) {
    console.error('deleteUser error:', error)
    return { success: false, error: error.message }
  }
}
