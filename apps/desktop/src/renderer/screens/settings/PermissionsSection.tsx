import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { Shield, Trash2, Plus, FolderOpen, Lock } from 'lucide-react'
import { toast } from 'sonner'

type GrantRow = {
  id: string
  scope: string
  grantedAt: number
  expiresAt?: number
}

export function PermissionsSection(): ReactElement {
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newScope, setNewScope] = useState('')

  // Sandbox roots state
  const [sandboxRoots, setSandboxRoots] = useState<string[]>([])
  const [defaultRoots, setDefaultRoots] = useState<string[]>([])
  const [newRootPath, setNewRootPath] = useState('')
  const [rootsLoading, setRootsLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.auralith.invoke('permissions.list', {})
      if (res.ok) {
        const data = res.data as { grants: GrantRow[] }
        setGrants(data.grants)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshRoots = useCallback(async () => {
    setRootsLoading(true)
    try {
      const res = await window.auralith.invoke('tools.getSandboxRoots', {})
      if (res.ok) {
        const data = res.data as { roots: string[]; defaults: string[]; extras: string[] }
        setSandboxRoots(data.roots)
        setDefaultRoots(data.defaults)
      }
    } finally {
      setRootsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void refreshRoots()
  }, [refresh, refreshRoots])

  async function handleGrant() {
    const scope = newScope.trim()
    if (!scope) return
    const res = await window.auralith.invoke('permissions.grant', { scope })
    if (res.ok) {
      setNewScope('')
      toast.success(`Permission granted: ${scope}`)
      void refresh()
    } else {
      toast.error('Failed to grant permission')
    }
  }

  async function handleRevoke(scope: string) {
    const res = await window.auralith.invoke('permissions.revoke', { scope })
    if (res.ok) {
      toast.success(`Revoked: ${scope}`)
      void refresh()
    } else {
      toast.error('Failed to revoke permission')
    }
  }

  async function handleAddRoot() {
    const path = newRootPath.trim()
    if (!path) return
    const res = await window.auralith.invoke('tools.addSandboxRoot', { path })
    if (res.ok) {
      const data = res.data as { roots: string[] }
      setSandboxRoots(data.roots)
      setNewRootPath('')
      toast.success('Sandbox root added')
    } else {
      toast.error('Failed to add root — check the path exists')
    }
  }

  async function handleBrowseRoot() {
    const res = await window.auralith.invoke('system.pickFolder', {
      title: 'Grant Auralith access to a folder',
      ...(newRootPath.trim() ? { defaultPath: newRootPath.trim() } : {}),
    })
    if (!res.ok) {
      toast.error('Could not open the folder picker')
      return
    }
    const data = res.data as { canceled: boolean; path?: string }
    if (!data.canceled && data.path) {
      setNewRootPath(data.path)
    }
  }

  async function handleRemoveRoot(path: string) {
    const res = await window.auralith.invoke('tools.removeSandboxRoot', { path })
    if (res.ok) {
      const data = res.data as { roots: string[] }
      setSandboxRoots(data.roots)
      toast.success('Root removed')
    } else {
      toast.error('Failed to remove root')
    }
  }

  const extraRoots = sandboxRoots.filter((r) => !defaultRoots.includes(r))

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Permissions</h2>
        <p className="text-sm text-[#6F6F80]">
          Active permission grants for folder watches and tool access.
        </p>
      </div>

      {/* ── Sandbox roots ───────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#F4F4F8] mb-0.5 flex items-center gap-1.5">
            <Lock size={13} className="text-violet-400" />
            AI tool sandbox
          </p>
          <p className="text-xs text-[#6F6F80]">
            The assistant can only create, read, or modify files inside these approved folders.
            Actions outside these roots are blocked and require your confirmation to add a new root.
          </p>
        </div>

        {/* Default (locked) roots */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#4B4B5A]">
            Default roots
          </p>
          {rootsLoading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
              ))
            : defaultRoots.map((root) => (
                <div
                  key={root}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <FolderOpen size={14} className="shrink-0 text-[#6F6F80]" />
                  <span className="flex-1 truncate font-mono text-xs text-[#A6A6B3]">{root}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/[0.05] text-[#6F6F80]">
                    default
                  </span>
                </div>
              ))}
        </div>

        {/* Extra (user-added) roots */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#4B4B5A]">
            Additional roots
          </p>
          {!rootsLoading && extraRoots.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/[0.06] py-5 text-center text-xs text-[#4B4B5A]">
              No additional roots. Add a folder below to expand the sandbox.
            </div>
          )}
          {extraRoots.map((root) => (
            <div
              key={root}
              className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
            >
              <FolderOpen size={14} className="shrink-0 text-violet-400" />
              <span className="flex-1 truncate font-mono text-xs text-[#F4F4F8]">{root}</span>
              <button
                onClick={() => void handleRemoveRoot(root)}
                className="shrink-0 rounded p-1 text-[#6F6F80] hover:bg-red-500/15 hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                aria-label={`Remove root ${root}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Add root form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newRootPath}
            onChange={(e) => setNewRootPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddRoot()
            }}
            placeholder="C:\Users\You\Projects"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] placeholder-[#4B4B5A] font-mono outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
          />
          <button
            onClick={() => void handleBrowseRoot()}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#F4F4F8] transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <FolderOpen size={14} /> Browse
          </button>
          <button
            onClick={() => void handleAddRoot()}
            disabled={!newRootPath.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <p className="text-[11px] text-[#4B4B5A]">
          Paste an absolute path. The folder must already exist on your machine.
        </p>
      </div>

      {/* ── Permission grants ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-[#F4F4F8] mb-0.5 flex items-center gap-1.5">
            <Shield size={13} className="text-violet-400" />
            Permission grants
          </p>
          <p className="text-xs text-[#6F6F80]">
            Active grants for folder watches and tool access scopes.
          </p>
        </div>

        {/* Grant form */}
        <div className="flex gap-2">
          <input
            data-testid="watched-folder-input"
            type="text"
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGrant()
            }}
            placeholder="folder:/path or tool:tool-id"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] placeholder-[#6F6F80] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
          />
          <button
            data-testid="watched-folder-add"
            onClick={() => void handleGrant()}
            disabled={!newScope.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Plus size={14} /> Grant
          </button>
        </div>

        {/* Grants list */}
        <div className="space-y-2">
          {loading && <div className="py-8 text-center text-sm text-[#6F6F80]">Loading…</div>}
          {!loading && grants.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.08] py-8 text-center text-sm text-[#6F6F80]">
              No permission grants yet.
            </div>
          )}
          {!loading &&
            grants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Shield size={14} className="shrink-0 text-violet-400" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-[#F4F4F8]">{g.scope}</p>
                    <p className="text-xs text-[#6F6F80]">
                      Granted {new Date(g.grantedAt).toLocaleDateString()}
                      {g.expiresAt
                        ? ` · Expires ${new Date(g.expiresAt).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void handleRevoke(g.scope)}
                  className="shrink-0 rounded-lg p-1.5 text-[#6F6F80] hover:bg-red-500/15 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  aria-label={`Revoke ${g.scope}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
