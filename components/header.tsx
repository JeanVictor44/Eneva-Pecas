import Link from "next/link";
import { Users, Wrench } from "lucide-react";
import { perfilAtual } from "@/lib/perfil";
import { InstallButton } from "./install-button";
import { LogoutButton } from "./logout-button";

export async function Header() {
  const perfil = await perfilAtual();

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
          {perfil?.permissoes.gerir_usuarios && (
            <Link
              href="/usuarios"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Users className="size-4" />
              <span className="hidden sm:inline">Usuários</span>
            </Link>
          )}
          {perfil?.email && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {perfil.email}
            </span>
          )}
          <InstallButton />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
