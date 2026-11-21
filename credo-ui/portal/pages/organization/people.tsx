import { useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * There is one list of people: People & payroll. This old address (Members, user management) opens it,
 * so bookmarks and links from earlier setup screens still land in the right place.
 */
export default function OrganizationPeopleRedirect() {
  const router = useRouter()
  useEffect(() => {
    void router.replace('/payroll?tab=employees')
  }, [router])
  return null
}
