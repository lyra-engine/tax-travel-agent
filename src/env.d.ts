/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      orgId: string;
      email: string;
      name: string;
      role: "admin" | "member";
      createdAt: number;
    };
    org?: {
      id: string;
      name: string;
      createdAt: number;
    };
    authEnabled?: boolean;
  }
}

interface ImportMetaEnv {
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly FIDELIS_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
