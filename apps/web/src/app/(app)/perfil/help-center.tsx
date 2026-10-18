import { RowChevron } from "@/components/row-chevron";

const QUESTIONS = [
  {
    question: "¿Por qué Te Jalo no cobra?",
    answer:
      "Te Jalo no procesa pagos ni cobra comisión. Quien maneja fija un precio por asiento y los pasajeros le pagan directamente con Yape o efectivo, sin intermediarios.",
  },
  {
    question: "¿Quién puede entrar a mi comunidad?",
    answer:
      "Solo quienes validan su pertenencia con el código de acceso de la comunidad o con su correo institucional.",
  },
  {
    question: "¿Qué significa que un vehículo está declarado?",
    answer: "Lo registró quien maneja. Todavía no verificamos el SOAT ni la tarjeta de propiedad.",
  },
];

export default function HelpCenter() {
  return (
    <section aria-labelledby="help-center" className="flex flex-col gap-2 border-t pt-4">
      <h3 id="help-center" className="font-semibold">
        Centro de ayuda
      </h3>
      {QUESTIONS.map(({ question, answer }) => (
        <details key={question} className="group rounded-xl bg-muted px-4 open:pb-3">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
            {question}
            <span
              aria-hidden
              className="text-muted-foreground transition-transform duration-200 group-open:rotate-90"
            >
              <RowChevron />
            </span>
          </summary>
          <p className="text-sm text-muted-foreground">{answer}</p>
        </details>
      ))}
    </section>
  );
}
