export interface ServerOptions {
  port?: number;
  hostname?: string;
  password?: string;
  requireAuth?: boolean;
  cors?: string[];
  mdns?: boolean;
  mdnsDomain?: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: { code: number; message: string };
  info?: Record<string, unknown>;
}
