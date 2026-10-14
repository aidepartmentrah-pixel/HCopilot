import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { canAccessSection, type SectionKey } from '../access'
import { useAuth } from '../providers/useAuth'

interface RequireSectionProps {
  section: SectionKey
  children: ReactNode
}

/** Opens a page only for users whose account includes its section; everyone else gets a clear message. */
export function RequireSection({ section, children }: RequireSectionProps) {
  const { user } = useAuth()
  // No signed-in user is handled by the login gate before the router renders; never block on it here.
  if (!user || canAccessSection(user, section)) return <>{children}</>
  return (
    <>
      <PageHeader title="No access" />
      <EmptyState
        icon={<Lock size={24} />}
        title="You don't have access to this page"
        description="Your account isn't allowed to open this page. Ask an administrator to add it to your permissions."
      />
    </>
  )
}
