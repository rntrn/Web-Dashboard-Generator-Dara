/** Pembungkus fetch DARA. Access token disimpan di memori. */
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || "Terjadi kesalahan");
  }
  return data;
}
