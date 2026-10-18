import NotifyForm from "./notify-form";
import PilotForm from "./pilot-form";

export default function InstitutionsPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-10 px-4 py-10">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-extrabold">¿Tu institución quiere sumarse?</h1>
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
