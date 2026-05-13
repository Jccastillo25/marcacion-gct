import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que solo pueden acceder owner/admin
const ADMIN_ONLY_PREFIXES: string[] = []

// Rutas que requieren autenticación (prefijos)
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/employees',
  '/attendance',
  '/schedules',
  '/leave',
  '/reports',
  '/organization',
  '/settings',
  '/security',
  '/kiosk',
  '/monitor',
  '/contracts',
  '/onboarding',
]

// Rutas de autenticación (redirigir si ya está autenticado)
const AUTH_ROUTES = ['/login']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANTE: usar getUser() no getSession() — valida el JWT con el servidor
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  )
  const isAuthRoute = AUTH_ROUTES.includes(pathname)

  // Usuario no autenticado intentando acceder a ruta protegida
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    // Solo guardar rutas internas (sin protocolo ni dominio externo)
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      loginUrl.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  // Verificar rol owner/admin para rutas de administración de accesos
  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  if (user && isAdminOnly) {
    const { data: memberships } = await supabase
      .from('company_memberships')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
 
    if (!memberships || memberships.length === 0) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      return NextResponse.redirect(dashboardUrl)
    }
  }

  // Usuario autenticado intentando acceder a /login → redirigir al dashboard
  if (user && isAuthRoute) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Aplica middleware a todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - archivos públicos con extensión
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
