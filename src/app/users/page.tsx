

"use client";

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

// ===== Types (mirror Prisma models we need) =====
export type Role = "SUPER_ADMIN" | "ADMIN" | "USER" | "GUEST";

export interface GroupDTO { id: number; name: string; description?: string | null }
export interface PermissionDTO { id: number; name: string; description?: string | null }

export interface UserDTO {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  lastLogin?: string;
  createdAt?: string;
  updatedAt?: string;
  groups?: GroupDTO[];
  permissions?: PermissionDTO[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ===== Helper fetcher =====
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json() as any; if (j?.error) msg = j.error } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function formatDate(s?: string) {
  if (!s) return "-";
  try { return new Date(s).toLocaleString("th-TH"); } catch { return s; }
}

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "USER", "GUEST"];

export default function UsersAdminPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserDTO[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // Reference data for RBAC
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [perms, setPerms] = useState<PermissionDTO[]>([]);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<null | UserDTO>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Edit form state
  const emptyForm: Partial<UserDTO & { password?: string; groupIds?: number[]; permissionIds?: number[]; }> = {
    email: "",
    username: "",
    firstName: "",
    lastName: "",
    role: "USER",
    isActive: true,
    password: "",
    groupIds: [],
    permissionIds: [],
  };
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false); // false=create, true=edit

  const any = users.length > 0;

  // ===== Loaders =====
  async function loadUsers(p = page, s = pageSize) {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (roleFilter) params.set("role", roleFilter);
      params.set("page", String(p));
      params.set("pageSize", String(s));

      const data = await fetchJson<any>(`/api/admin/users?${params.toString()}`);
      const arr: UserDTO[] = Array.isArray(data?.items) ? data.items
        : Array.isArray(data?.results) ? data.results
        : Array.isArray(data) ? data : [];
      setUsers(arr);
      setPagination(data?.pagination || {
        page: p,
        pageSize: s,
        total: data?.total ?? arr.length,
        totalPages: data?.totalPages ?? 1,
      });
    } catch (e: any) {
      setError(e?.message || "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      setUsers([]);
      setPagination(null);
    } finally { setLoading(false); }
  }

  async function loadGroupsAndPerms() {
    try {
      const [g, p] = await Promise.all([
        fetchJson<any>("/api/admin/groups").catch(()=>[]),
        fetchJson<any>("/api/admin/permissions").catch(()=>[]),
      ]);
      const gArr: GroupDTO[] = Array.isArray(g?.items) ? g.items : Array.isArray(g) ? g : [];
      const pArr: PermissionDTO[] = Array.isArray(p?.items) ? p.items : Array.isArray(p) ? p : [];
      setGroups(gArr);
      setPerms(pArr);
    } catch {
      // ignore best-effort
    }
  }

  useEffect(() => { void loadGroupsAndPerms(); }, []);
  useEffect(() => { void loadUsers(1, pageSize); setPage(1); }, [roleFilter]);
  useEffect(() => { void loadUsers(page, pageSize); }, [pageSize]);

  // ===== Handlers =====
  const onSearch = async (e: React.FormEvent) => { e.preventDefault(); await loadUsers(1, pageSize); setPage(1); };

  function openCreate() {
    setIsEditing(false);
    setForm({ ...emptyForm });
    setSaveErr(null);
    setEditOpen(true);
  }

  function openEdit(u: UserDTO) {
    setIsEditing(true);
    setForm({
      id: u.id,
      email: u.email,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      password: "",
      groupIds: (u.groups || []).map(g => g.id),
      permissionIds: (u.permissions || []).map(p => p.id),
    });
    setSaveErr(null);
    setEditOpen(true);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveErr(null);
    try {
      const payload: any = {
        email: form.email,
        username: form.username,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        isActive: !!form.isActive,
        groupIds: form.groupIds || [],
        permissionIds: form.permissionIds || [],
      };
      if (form.password) payload.password = form.password;

      if (isEditing && form.id) {
        await fetchJson(`/api/admin/users/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson(`/api/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await loadUsers(page, pageSize);
      setEditOpen(false);
    } catch (e: any) {
      setSaveErr(e?.message || "บันทึกผู้ใช้ไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  async function removeUser(u: UserDTO) {
    try {
      await fetchJson(`/api/admin/users/${u.id}`, { method: "DELETE" });
      await loadUsers(page, pageSize);
      setDeleteOpen(null);
    } catch (e: any) {
      alert(e?.message || "ลบผู้ใช้ไม่สำเร็จ");
    }
  }

  async function toggleActive(u: UserDTO) {
    try {
      await fetchJson(`/api/admin/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      await loadUsers(page, pageSize);
    } catch (e: any) { alert(e?.message || "อัปเดตสถานะไม่สำเร็จ"); }
  }

  const pageNumbers = useMemo(() => {
    if (!pagination) return [] as (number | "…")[];
    const { page: cur, totalPages } = pagination;
    const out: (number | "…")[] = [];
    const rng = (s: number, e: number) => { for (let i=s;i<=e;i++) out.push(i); };
    if (totalPages <= 7) rng(1, totalPages);
    else {
      out.push(1);
      if (cur > 4) out.push("…");
      const s = Math.max(2, cur-2);
      const e = Math.min(totalPages-1, cur+2);
      rng(s,e);
      if (cur < totalPages-3) out.push("…");
      out.push(totalPages);
    }
    return out;
  }, [pagination]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <meta charSet="UTF-8" />
        <title>จัดการผู้ใช้และสิทธิ์ (RBAC)</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-800">ผู้ใช้ &amp; RBAC</h1>
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1Z"/></svg>
            สร้างผู้ใช้
          </button>
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-lg shadow p-3 mb-4">
          <form onSubmit={onSearch} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={q}
              onChange={(e)=> setQ(e.target.value)}
              placeholder="ค้นหาอีเมล/ชื่อผู้ใช้/ชื่อ-สกุล"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select value={roleFilter} onChange={(e)=> setRoleFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-md">
              <option value="">ทุกบทบาท</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="submit" className={`px-4 py-2 rounded-md bg-blue-600 text-white ${loading?"opacity-50 cursor-not-allowed":"hover:bg-blue-700"}`}>ค้นหา</button>
          </form>
        </div>

        {/* Error */}
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">ผู้ใช้</th>
                  <th className="px-3 py-2 text-left">อีเมล</th>
                  <th className="px-3 py-2 text-left">บทบาท</th>
                  <th className="px-3 py-2 text-left">กลุ่ม</th>
                  <th className="px-3 py-2 text-left">สถานะ</th>
                  <th className="px-3 py-2 text-left">เข้าใช้งานล่าสุด</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">กำลังโหลด…</td></tr>
                )}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">ไม่พบผู้ใช้</td></tr>
                )}
                {!loading && users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{u.firstName} {u.lastName}</div>
                      <div className="text-gray-500 text-xs">@{u.username}</div>
                    </td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs">{u.role}</span>
                    </td>
                    <td className="px-3 py-2">
                      {(u.groups && u.groups.length>0) ? (
                        <div className="flex flex-wrap gap-1">
                          {u.groups.map(g => (
                            <span key={g.id} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-gray-800 text-xs">{g.name}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={()=> toggleActive(u)} className={`px-2 py-1 rounded text-xs ${u.isActive?"bg-green-100 text-green-800":"bg-gray-100 text-gray-700"}`}>{u.isActive?"ใช้งาน":"ปิดการใช้งาน"}</button>
                    </td>
                    <td className="px-3 py-2">{formatDate(u.lastLogin)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={()=> openEdit(u)} className="p-1.5 rounded hover:bg-gray-100" title="แก้ไข">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25Zm2.92 2.33h-.84v-.84l9.9-9.9.84.84-9.9 9.9ZM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.59 1.59 3.75 3.75 1.59-1.59Z"/></svg>
                        </button>
                        <button onClick={()=> setDeleteOpen(u)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="ลบ">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm-3 6h12l-1 10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9Z"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
              <div className="text-sm text-gray-600">หน้า {pagination.page}/{pagination.totalPages} • ทั้งหมด {pagination.total}</div>
              <div className="flex items-center gap-1">
                <select value={pageSize} onChange={(e)=> setPageSize(parseInt(e.target.value,10))} className="px-2 py-1 border rounded text-sm">
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                {pageNumbers.map((p, i)=> p === "…" ? (
                  <span key={i} className="px-2">…</span>
                ) : (
                  <button key={i} onClick={()=> { setPage(p as number); void loadUsers(p as number, pageSize); }} className={`px-2 py-1 rounded text-sm ${p===pagination.page?"bg-blue-600 text-white":"hover:bg-gray-100"}`}>{p}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">{isEditing?"แก้ไขผู้ใช้":"สร้างผู้ใช้"}</h3>
              <button onClick={()=> setEditOpen(false)} className="p-1.5 rounded hover:bg-gray-100" aria-label="ปิด">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6.22 6.22a.75.75 0 0 1 1.06 0L12 10.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L13.06 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L12 13.06l-4.72 4.72a.75.75 0 1 1-1.06-1.06L10.94 12 6.22 7.28a.75.75 0 0 1 0-1.06Z"/></svg>
              </button>
            </div>

            <form className="p-4 space-y-4" onSubmit={saveUser}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">
                  <span>อีเมล</span>
                  <input type="email" required value={form.email||""} onChange={(e)=> setForm(f=>({...f, email:e.target.value}))} className="px-3 py-2 border rounded"/>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>ชื่อผู้ใช้ (username)</span>
                  <input type="text" required value={form.username||""} onChange={(e)=> setForm(f=>({...f, username:e.target.value}))} className="px-3 py-2 border rounded"/>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>ชื่อ</span>
                  <input type="text" required value={form.firstName||""} onChange={(e)=> setForm(f=>({...f, firstName:e.target.value}))} className="px-3 py-2 border rounded"/>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>นามสกุล</span>
                  <input type="text" required value={form.lastName||""} onChange={(e)=> setForm(f=>({...f, lastName:e.target.value}))} className="px-3 py-2 border rounded"/>
                </label>

                <label className="grid gap-1 text-sm">
                  <span>บทบาท (Role)</span>
                  <select value={form.role||"USER"} onChange={(e)=> setForm(f=>({...f, role: e.target.value as Role}))} className="px-3 py-2 border rounded">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span>รหัสผ่าน {isEditing?"(ปล่อยว่างถ้าไม่เปลี่ยน)":""}</span>
                  <input type="password" value={form.password||""} onChange={(e)=> setForm(f=>({...f, password:e.target.value}))} className="px-3 py-2 border rounded"/>
                </label>

                <label className="flex items-center gap-2 text-sm mt-2">
                  <input type="checkbox" checked={!!form.isActive} onChange={(e)=> setForm(f=>({...f, isActive:e.target.checked}))} />
                  <span>เปิดใช้งาน</span>
                </label>
              </div>

              {/* Groups */}
              <div className="pt-1">
                <div className="text-sm font-semibold mb-2">กลุ่ม (Groups)</div>
                {groups.length === 0 ? (
                  <div className="text-sm text-gray-500">ไม่มีข้อมูลกลุ่ม</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {groups.map(g => (
                      <label key={g.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(form.groupIds||[]).includes(g.id)}
                          onChange={(e)=> setForm(f=>{
                            const set = new Set(f.groupIds||[]);
                            if (e.target.checked) set.add(g.id); else set.delete(g.id);
                            return { ...f, groupIds: Array.from(set) };
                          })}
                        />
                        <span>{g.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Permissions */}
              <div className="pt-1">
                <div className="text-sm font-semibold mb-2">สิทธิ์ (Permissions)</div>
                {perms.length === 0 ? (
                  <div className="text-sm text-gray-500">ไม่มีข้อมูลสิทธิ์</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {perms.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(form.permissionIds||[]).includes(p.id)}
                          onChange={(e)=> setForm(f=>{
                            const set = new Set(f.permissionIds||[]);
                            if (e.target.checked) set.add(p.id); else set.delete(p.id);
                            return { ...f, permissionIds: Array.from(set) };
                          })}
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {saveErr && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{saveErr}</div>}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={()=> setEditOpen(false)} className="px-3 py-2 rounded border">ยกเลิก</button>
                <button type="submit" disabled={saving} className={`px-4 py-2 rounded text-white ${saving?"bg-blue-400":"bg-blue-600 hover:bg-blue-700"}`}>{saving?"กำลังบันทึก…":"บันทึก"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">ยืนยันการลบผู้ใช้</h3>
            </div>
            <div className="p-4 text-sm text-gray-700">
              ต้องการลบผู้ใช้ <b>{deleteOpen.firstName} {deleteOpen.lastName}</b> (@{deleteOpen.username}) ใช่หรือไม่?
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
              <button onClick={()=> setDeleteOpen(null)} className="px-3 py-2 rounded border">ยกเลิก</button>
              <button onClick={()=> removeUser(deleteOpen)} className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}