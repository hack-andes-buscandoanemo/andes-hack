const QUESTIONS = [
  {
    question: "¿Por qué Te Jalo no cobra?",
    answer:
      "Te Jalo no procesa pagos ni cobra comisión. Quien maneja fija un precio base por asiento y los pasajeros le pagan directamente con Yape o efectivo, sin intermediarios.",
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
    <section aria-labelledby="help-center" className="flex flex-col gap-2 pt-2">
      <h3 id="help-center" className="font-semibold">
        Centro de ayuda
      </h3>
      {QUESTIONS.map(({ question, answer }) => (
        <details key={question} className="rounded-lg bg-muted px-3 py-2">
          <summary className="min-h-7 cursor-pointer font-medium">{question}</summary>
          <p className="pt-1 text-sm text-muted-foreground">{answer}</p>
        </details>
      ))}
    </section>
  );
}
