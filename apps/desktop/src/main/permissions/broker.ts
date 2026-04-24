export type PermissionTier = 'safe' | 'confirm' | 'restricted'

export type PermissionScope = { kind: 'folder'; path: string } | { kind: 'tool'; toolId: string }

export type PermissionGrant = {
  id: string
  scope: PermissionScope
  grantedAt: Date
  expiresAt?: Date
}

// In-memory store for session-level grants; persistence handled by core-db in M2
const sessionGrants = new Map<string, PermissionGrant>()

function scopeKey(scope: PermissionScope): string {
  return scope.kind === 'folder' ? `folder:${scope.path}` : `tool:${scope.toolId}`
}

export function hasGrant(scope: PermissionScope): boolean {
  const key = scopeKey(scope)
  const grant = sessionGrants.get(key)
  if (!grant) return false
  if (grant.expiresAt && grant.expiresAt < new Date()) {
    sessionGrants.delete(key)
    return false
  }
  return true
}

export function addGrant(grant: PermissionGrant): void {
  const key = scopeKey(grant.scope)
  sessionGrants.set(key, grant)
}

export function revokeGrant(scope: PermissionScope): void {
  sessionGrants.delete(scopeKey(scope))
}

export function listGrants(): PermissionGrant[] {
  return Array.from(sessionGrants.values())
}
