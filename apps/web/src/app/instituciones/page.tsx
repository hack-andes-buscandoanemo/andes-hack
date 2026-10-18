import NotifyForm from "./notify-form";
import StandaloneHeader from "@/components/standalone-header";
import PilotForm from "./pilot-form";

export default function InstitutionsPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-10 px-4 pt-5 pb-10">
      <StandaloneHeader />
      <header className="space-y-2">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          ¿Tu institución quiere sumarse?
        </h1>
        <p className="text-muted-foreground">
          Te Jalo funciona dentro de comunidades verificadas. Si tu institución aún no está, déjanos
          tus datos.
        </p>
      </header>
      <PilotForm />
      <NotifyForm />
    </main>
  );
}
