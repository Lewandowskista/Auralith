import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DbClient } from '../client'
import { permissionGrants } from '../schema/system'

export type PermissionGrant = {
  id: string
  scope: string
  grantedAt: Date
  expiresAt?: Date
}

export type PermissionsRepo = ReturnType<typeof createPermissionsRepo>

export function createPermissionsRepo(db: DbClient) {
  function grant(scope: string, expiresAt?: Date): PermissionGrant {
    const id = randomUUID()
    const now = new Date()
    db.insert(permissionGrants)
      .values({ id, scope, grantedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: permissionGrants.scope,
        set: { grantedAt: now, expiresAt: expiresAt ?? null },
      })
      .run()
    const result: PermissionGrant = { id, scope, grantedAt: now }
    if (expiresAt !== undefined) result.expiresAt = expiresAt
    return result
  }

  function revoke(scope: string): void {
    db.delete(permissionGrants).where(eq(permissionGrants.scope, scope)).run()
  }

  function has(scope: string): boolean {
    const row = db.select().from(permissionGrants).where(eq(permissionGrants.scope, scope)).get()
    if (!row) return false
    if (row.expiresAt && row.expiresAt < new Date()) {
      revoke(scope)
      return false
    }
    return true
  }

  function list(): PermissionGrant[] {
    return db
      .select()
      .from(permissionGrants)
      .all()
      .map((r) => {
        const entry: PermissionGrant = { id: r.id, scope: r.scope, grantedAt: r.grantedAt }
        if (r.expiresAt != null) entry.expiresAt = r.expiresAt
        return entry
      })
  }

  return { grant, revoke, has, list }
}
