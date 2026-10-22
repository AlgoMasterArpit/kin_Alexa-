import { z } from 'zod';

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1));

const isValidTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  KIN_DB_PATH: z.string().min(1).default('data/kin.db'),
  KIN_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, { message: 'must be a valid IANA time zone' })
    .default('Asia/Kolkata'),
  KIN_PARENT_NAME: z.string().trim().min(1).max(40).default('Mom'),
  KIN_API_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
  KIN_ALLOWED_HOSTS: csv.optional(),
  NTFY_BASE_URL: z.url().default('https://ntfy.sh'),
  NTFY_TOPIC: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'must be 8-64 letters, digits, dashes or underscores')
    .optional(),
  BEDROCK_ENABLED: z.stringbool().default(false),
  BEDROCK_REGION: z.string().optional(),
  BEDROCK_MODEL: z.string().min(1).default('anthropic.claude-opus-5-5'),
});

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  readonly databasePath: string;
  readonly timeZone: string;
  readonly parentName: string;
  readonly apiToken: string | undefined;
  readonly allowedHosts: readonly string[] | undefined;
  readonly ntfy: { readonly baseUrl: string; readonly topic: string | undefined };
  readonly bedrock: {
    readonly enabled: boolean;
    readonly region: string | undefined;
    readonly model: string;
  };
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const values = parsed.data;
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(values.HOST);
  if (!loopback && !values.KIN_API_TOKEN) {
    throw new ConfigError('KIN_API_TOKEN is required when HOST exposes Kin beyond this machine.');
  }
  if (!loopback && !values.KIN_ALLOWED_HOSTS) {
    throw new ConfigError(
      'KIN_ALLOWED_HOSTS is required when HOST exposes Kin beyond this machine.',
    );
  }
  if (values.BEDROCK_ENABLED && !values.BEDROCK_REGION) {
    throw new ConfigError('BEDROCK_REGION is required when BEDROCK_ENABLED is true.');
  }
  return {
    host: values.HOST,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    databasePath: values.KIN_DB_PATH,
    timeZone: values.KIN_TIMEZONE,
    parentName: values.KIN_PARENT_NAME,
    apiToken: values.KIN_API_TOKEN,
    allowedHosts: values.KIN_ALLOWED_HOSTS,
    ntfy: { baseUrl: values.NTFY_BASE_URL, topic: values.NTFY_TOPIC },
    bedrock: {
      enabled: values.BEDROCK_ENABLED,
      region: values.BEDROCK_REGION,
      model: values.BEDROCK_MODEL,
    },
  };
}
