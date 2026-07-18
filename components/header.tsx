import Link from "next/link";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InstallButton } from "./install-button";
import { LogoutButton } from "./logout-button";

export async function Header() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/pecas" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Wrench className="size-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Catálogo de Peças
            </span>
            <span className="text-xs text-muted-foreground">Manutenção</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {data.user?.email && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {data.user.email}
            </span>
          )}
          <InstallButton />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
