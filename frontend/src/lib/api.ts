export class ApiError extends Error {
  status: number;
  code: string;
  details?: { field?: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { field?: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  search?: Record<string, string | number | boolean | null | undefined>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  if (options.search) {
    for (const [key, value] of Object.entries(options.search)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'We could not reach the server. Check your connection and try again.');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: ApiError['details'] } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, search?: RequestOptions['search']) => request<T>(path, { method: 'GET', search }),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
    request<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {};
  const map: Record<string, string> = {};
  for (const detail of error.details) {
    if (detail.field && !map[detail.field]) map[detail.field] = detail.message;
  }
  return map;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
