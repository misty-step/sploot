import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { TextEncoder, TextDecoder } from 'util';

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Clear localStorage between tests
  if (global.localStorage) {
    global.localStorage.clear();
  }
});

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Polyfill Request and Response for Next.js API routes testing
if (!global.Request) {
  global.Request = class Request {
    url: string;
    method: string;
    headers: Headers;
    body: any;

    constructor(input: string | Request, init?: RequestInit) {
      if (typeof input === 'string') {
        this.url = input;
      } else {
        this.url = input.url;
      }
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers);
      this.body = init?.body;
    }

    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body);
      }
      return this.body;
    }

    async text() {
      if (typeof this.body === 'string') {
        return this.body;
      }
      return JSON.stringify(this.body);
    }

    clone() {
      return new Request(this.url, {
        method: this.method,
        headers: this.headers,
        body: this.body,
      });
    }
  } as any;
}

if (!global.Response) {
  global.Response = class Response {
    body: any;
    status: number;
    statusText: string;
    headers: Headers;
    ok: boolean;

    constructor(body?: any, init?: ResponseInit) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers);
      this.ok = this.status >= 200 && this.status < 300;
    }

    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body);
      }
      return this.body;
    }

    async text() {
      if (typeof this.body === 'string') {
        return this.body;
      }
      return JSON.stringify(this.body);
    }

    clone() {
      return new Response(this.body, {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers,
      });
    }
  } as any;
}

if (!global.Headers) {
  global.Headers = class Headers {
    private headers: Map<string, string> = new Map();

    constructor(init?: HeadersInit) {
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.set(key, value));
        } else if (init instanceof Headers) {
          init.forEach((value, key) => this.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.set(key, value as string));
        }
      }
    }

    set(key: string, value: string) {
      this.headers.set(key.toLowerCase(), value);
    }

    get(key: string) {
      return this.headers.get(key.toLowerCase()) || null;
    }

    has(key: string) {
      return this.headers.has(key.toLowerCase());
    }

    delete(key: string) {
      this.headers.delete(key.toLowerCase());
    }

    forEach(callback: (value: string, key: string) => void) {
      this.headers.forEach((value, key) => callback(value, key));
    }

    entries() {
      return this.headers.entries();
    }

    keys() {
      return this.headers.keys();
    }

    values() {
      return this.headers.values();
    }
  } as any;
}

// Mock FormData
if (!global.FormData) {
  global.FormData = class FormData {
    private data = new Map<string, any>();

    append(key: string, value: any) {
      this.data.set(key, value);
    }

    get(key: string) {
      return this.data.get(key) || null;
    }

    has(key: string) {
      return this.data.has(key);
    }

    delete(key: string) {
      this.data.delete(key);
    }

    set(key: string, value: any) {
      this.data.set(key, value);
    }

    forEach(callback: (value: any, key: string) => void) {
      this.data.forEach((value, key) => callback(value, key));
    }

    entries() {
      return this.data.entries();
    }

    keys() {
      return this.data.keys();
    }

    values() {
      return this.data.values();
    }
  } as any;
}

// Mock environment variables for testing
// These provide valid-looking values so tests don't fail on env checks
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock_12345678901234567890';
process.env.CLERK_SECRET_KEY = 'sk_test_mock_12345678901234567890';
process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_test_mock_token_12345678901234567890';
process.env.REPLICATE_API_TOKEN = 'r8_test_mock_token_12345678901234567890';

// Keep DB config aligned with the CI postgres service unless already provided.
const defaultTestDbUrl = 'postgresql://postgres:postgres@localhost:5432/sploot_test';
const setDefaultEnv = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

setDefaultEnv('DATABASE_URL', defaultTestDbUrl);

// Mock fetch globally
global.fetch = vi.fn((url: string, options?: RequestInit) => {
  // Mock /api/assets/{id}/generate-embedding endpoint
  if (url.includes('/generate-embedding')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true }),
      clone: () => ({ ok: true, status: 200 }),
    } as Response);
  }

  // Default successful response for other endpoints
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => JSON.stringify({}),
    clone: () => ({ ok: true, status: 200 }),
  } as Response);
}) as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver (required by cmdk and other components)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollIntoView (required by cmdk keyboard navigation)
Element.prototype.scrollIntoView = vi.fn();

// Mock crypto (use Object.defineProperty to override readonly property)
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9),
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
  writable: true,
  configurable: true,
});

// Mock localStorage with proper isolation
class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

Object.defineProperty(global, 'localStorage', {
  value: new LocalStorageMock(),
  writable: true,
  configurable: true,
});

// Mock NextResponse
vi.mock('next/server', async () => {
  const actualNext = await vi.importActual('next/server');
  return {
    ...actualNext,
    NextRequest: class NextRequest {
      url: string;
      method: string;
      headers: Headers;
      body: any;
      nextUrl: any;

      constructor(input: string | URL | Request, init?: RequestInit) {
        if (typeof input === 'string') {
          this.url = input;
        } else if (input instanceof URL) {
          this.url = input.href;
        } else {
          this.url = input.url || 'http://localhost:3000';
        }
        this.method = init?.method || 'GET';
        this.headers = new Headers(init?.headers);
        this.body = init?.body;
        const url = new URL(this.url);
        this.nextUrl = {
          searchParams: url.searchParams,
          pathname: url.pathname,
          href: url.href,
        };
      }

      async json() {
        if (typeof this.body === 'string') {
          return JSON.parse(this.body);
        }
        return this.body;
      }

      async text() {
        if (typeof this.body === 'string') {
          return this.body;
        }
        return JSON.stringify(this.body);
      }

      async formData() {
        // If body is already FormData, return it
        if (this.body instanceof FormData) return this.body;
        // Otherwise return empty FormData (tests construct their own)
        return new FormData();
      }

      clone() {
        return new NextRequest(this.url, {
          method: this.method,
          headers: this.headers,
          body: this.body,
        });
      }
    },
    NextResponse: class NextResponse extends Response {
      static json(body: any, init?: ResponseInit) {
        const response = new Response(JSON.stringify(body), {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
          },
        });
        // Add json method to the response instance
        (response as any).json = async () => body;
        return response;
      }

      static redirect(url: string | URL, status?: number) {
        return new Response(null, {
          status: status || 302,
          headers: {
            Location: url.toString(),
          },
        });
      }
    },
  };
});

// Polyfill File.arrayBuffer() for tests
if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = async function(this: File) {
    // In test environment, crypto.subtle.digest is mocked anyway,
    // so we just need to return a valid ArrayBuffer
    const encoder = new TextEncoder();
    // Use file name as content for a non-empty buffer
    const content = this.name || 'test content';
    return encoder.encode(content).buffer;
  };
}
