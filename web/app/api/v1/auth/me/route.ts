import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get employee ID from email
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, company_id')
    .eq('email', user.email)
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    employee_id: employee.id,
    company_id: employee.company_id,
  })
}
